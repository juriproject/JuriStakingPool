const each = require('async/each')
const map = require('async/map')

let allNodes

const fetchAllNodes = () =>
  juriBondingContract.methods.getAllStakingNodes().call()

const downloadHeartRateData = async user => {
  const storagePath = await juriNetworkProxyContract.methods
    .userHeartRateDataStoragePaths(roundIndex, user)
    .call()

  const file = await downloadFromChain(storagePath) // TODO

  return file
}

const retrieveAssignedUsers = async () => {
  const pools = await juriNetworkProxyContract.methods
    .registeredJuriStakingPools(roundIndex, user)
    .call()

  const users = await map(pools, poolAddress =>
    new web3.eth.Contract(poolAbi, poolAddress).methods.poolUsers().call()
  )

  const uniqUsers = [...new Set(users)]
  const assignedUsers = []

  await each(uniqUsers, async user => {
    const userWorkoutSignature = await juriNetworkProxyContract.methods
      .userWorkoutSignatures(roundIndex, user)
      .call()

    let lowestHash = 100e18
    let lowestIndex = -1

    for (let i = 0; i < bondedTokenAmount; i++) {
      const verifierHash = uint256(
        keccak256(userWorkoutSignature, myJuriNodeAddress, i)
      ) // TODO proper conversion (BigNumber + web3.utils.keccak256 ?)

      if (verifierHash < lowestHash) {
        lowestHash = verifierHash
        lowestIndex = i
      }
    }

    if (lowestHash < THRESHOLD)
      assignedUsers.push({ address: user, lowestIndex })
  })

  return assignedUsers
}

const sendCommitments = async ({ users, isDissent }) => {
  const userAddresses = []
  const wasCompliantData = []
  const wasCompliantDataCommitments = []
  const proofIndices = []
  const randomNumbers = []

  await each(users, async ({ address, lowestIndex }) => {
    const heartRateData = await downloadHeartRateData(address)
    const wasCompliant = verifyHeartRateData(heartRateData)
    const randomNumber = crypto.randomBytes(32).toString()
    const commitmentHash = keccak256(wasCompliant, randomNumber)

    userAddresses.push(address)
    wasCompliantData.push(wasCompliant)
    wasCompliantDataCommitments.push(commitmentHash)
    proofIndices.push(lowestIndex)
    randomNumbers.push(randomNumber)
  })

  const addMethod = isDissent
    ? 'addDissentWasCompliantDataCommitmentsForUsers'
    : 'addWasCompliantDataCommitmentsForUsers'

  await juriNetworkProxyContract.methods[addMethod](
    userAddresses,
    wasCompliantDataCommitments,
    proofIndices
  ).send()

  return { randomNumbers, wasCompliantData }
}

const sendReveals = async ({
  users,
  randomNumbers,
  wasCompliantData,
  isDissent,
}) => {
  const userAddresses = users.map(user => user.address)
  const addMethod = isDissent
    ? 'addDissentWasCompliantDataForUsers'
    : 'addWasCompliantDataForUsers'

  await juriNetworkProxyContract.methods[addMethod](
    userAddresses,
    wasCompliantData,
    randomNumbers
  ).send()
}

const checkForInvalidAnswers = async ({ assignedUsers, wasCompliantData }) => {
  await each(assignedUsers, async (user, i) => {
    const acceptedAnswer = await juriNetworkProxyContract.methods
      .getUserComplianceData(roundIndex, user)
      .call({ from: registeredJuriStakingPoolAddress })

    if (!!acceptedAnswer !== wasCompliantData[i])
      await juriNetworkProxyContract.methods
        .dissentToAcceptedAnswer(user)
        .send()
  })
}

const receiveDissentedUsers = () =>
  juriNetworkProxyContract.methods.dissentedUsers().call()

const findAllNotRevealedNodes = async () => {
  const notRevealedNodes = []

  await each(allNodes, async node => {
    await each(allUsers, async user => {
      const value = await juriNetworkProxyContract.methods
        .userComplianceDataCommitments(node, roundIndex, user)
        .call()

      if (
        value != 0x0 &&
        !juriNetworkProxyContract.methods.hasRevealed(user).call()
      ) {
        notRevealedNodes.push(node)
      }
    })
  })

  return notRevealedNodes
}

const findAllOfflineNodes = async () => {
  const offlineNodes = []

  await each(allNodes, async node => {
    await each(dissentedUsers, async user => {
      const userWasDissented = await juriNetworkProxyContract.methods
        .dissented(roundIndex, user)
        .call()

      if (userWasDissented) {
        const commitment = await juriNetworkProxyContract.methods.userComplianceDataCommitments(
          node,
          roundIndex,
          _dissentedUser
        )

        if (commitment == 0x0) offlineNodes.push(node)
      }
    })
  })

  return offlineNodes
}

const findAllIncorrectResultNodes = async dissentedUsers => {
  const incorrectResultNodes = []

  await each(allNodes, async node => {
    await each(dissentedUsers, async user => {
      const givenAnswer = await juriNetworkProxyContract.methods
        .givenNodeResults(node, roundIndex, user)
        .call()
      const acceptedAnswer = await juriNetworkProxyContract.methods
        .givenNodeResults(roundIndex, user)
        .call()

      if (givenAnswer !== acceptedAnswer) incorrectResultNodes.push(node)
    })
  })

  return incorrectResultNodes
}

const findAllIncorrectDissentNodes = async dissentedUsers => {
  const incorrectDissentNodes = []

  await each(allNodes, async node => {
    await each(dissentedUsers, async user => {
      const hasDissented = await juriNetworkProxyContract.methods
        .hasDissented(node, roundIndex, user)
        .call()
      const previousAnswer = await juriNetworkProxyContract.methods
        .userComplianceDataBeforeDissents(roundIndex, user)
        .call()
      const acceptedAnswer = await juriNetworkProxyContract.methods
        .givenNodeResults(roundIndex, user)
        .call()

      if (hasDissented && previousAnswer === acceptedAnswer)
        incorrectDissentNodes.push(node)
    })
  })

  return incorrectDissentNodes
}

const slashDishonestNodes = async dissentedUsers => {
  const notRevealedNodes = await findAllNotRevealedNodes()
  const offlineNodes = await findAllOfflineNodes()
  const incorrectResultNodes = await findAllIncorrectResultNodes(dissentedUsers)
  const incorrectDissentNodes = await findAllIncorrectDissentNodes()

  await each(notRevealedNodes, ({ toSlash, user }) =>
    juriBondingContract.methods.slashStakeForNotRevealing(toSlash, user).send()
  )

  await each(offlineNodes, toSlash =>
    juriBondingContract.methods.slashStakeForBeingOffline(toSlash).send()
  )

  await each(incorrectResultNodes, ({ toSlash, user }) =>
    juriBondingContract.methods
      .slashStakeForIncorrectResult(toSlash, user)
      .send()
  )

  await each(incorrectDissentNodes, ({ toSlash, user }) =>
    juriBondingContract.methods
      .slashStakeForIncorrectDissenting(toSlash, user)
      .send()
  )
}

const moveToNextRound = async () => {
  const roundIndexInProxy = await juriNetworkProxyContract.methods
    .roundIndex()
    .call()

  if (roundIndexInProxy === roundIndex)
    await juriNetworkProxyContract.methods.moveToNextRound().send()
}

const fetchStageTimes = async () => {
  const stageNames = [
    timeForCommitmentStage,
    timeForRevealStage,
    timeForDissentStage,
    timeForDissentCommitmentStage,
    timeForDissentRevealStage,
    timeForSlashingStage,
  ]
  const stageTimes = await map(stageNames, stageName =>
    juriNetworkProxyContract.methods[stageName]().call()
  )

  return stageTimes
}

const retrieveRewards = async () => {
  await juriTokenContract.methods.retrieveRoundInflationRewards().send()
  await juriNetworkProxyContract.methods.retrieveRoundJuriFees().send()
}

// Stages:

// 1) Users adding heart rate data
// 2) Nodes downloading heart rate data, analyzing it, sending commitments
// 3) Nodes revealing commitments
// 4) Nodes checking accepted answers and dissenting if required
// 5) Nodes checking for any dissented answers
// 5.1) Found any? Download heart rate data, analyze, send commitment
// 5.2) Nodes revealing commitment
// 6) Accepted answer found and can be read by JuriStakingPool
// 7) Move to next round

const runRound = async () => {
  const [
    timeForCommitmentStage,
    timeForRevealStage,
    timeForDissentStage,
    timeForDissentCommitmentStage,
    timeForDissentRevealStage,
    timeForSlashingStage,
  ] = await fetchStageTimes()

  allNodes = await fetchAllNodes()

  // STAGE 2
  const assignedUsers = await retrieveAssignedUsers()

  const { randomNumbers, wasCompliantData } = await sendCommitments({
    users: assignedUsers,
    isDissent: false,
  })

  await sleep(timeForCommitmentStage)

  // STAGE 3
  await sendReveals({
    assignedUsers,
    randomNumbers,
    wasCompliantData,
    isDissent: false,
  })
  await sleep(timeForRevealStage)

  // STAGE 4
  await checkForInvalidAnswers(assignedUsers)
  await sleep(timeForDissentStage)

  // STAGE 5
  const dissentedUsers = await receiveDissentedUsers()

  if (dissentedUsers.length > 0) {
    // STAGE 5.1
    const { randomNumbers, wasCompliantData } = await sendCommitments({
      users: dissentedUsers,
      isDissent: true,
    })
    await sleep(timeForDissentCommitmentStage)

    // STAGE 5.2
    await sendReveals({
      users: dissentedUsers,
      randomNumbers,
      wasCompliantData,
      isDissent: true,
    })
    await sleep(timeForDissentRevealStage)
  }

  await retrieveRewards()
  await slashDishonestNodes(dissentedUsers)

  await sleep(timeForSlashingStage)

  // STAGE 7
  await moveToNextRound()
}

module.exports = runRound
