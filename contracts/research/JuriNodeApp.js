const each = require('async/each')
const map = require('async/map')

const FIVE_MINUTES = 1000 * 60 * 5

const downloadHeartRateData = async user => {
  const storagePath = await juriNetworkProxyContract.methods
    .userHeartRateDataStoragePaths(roundIndex, user)
    .call()

  const file = await downloadFromChain(storagePath)

  return file
}

const retrieveAssignedUsers = async () => {
  const pools = await juriNetworkProxyContract.methods
    .registeredJuriStakingPools(roundIndex, user)
    .call()

  const users = await map(pools, poolAddress =>
    new web3.eth.Contract(poolAbi, poolAddress).methods.poolUsers().call()
  )

  // TODO remove duplicates

  const assignedUsers = []

  await each(users, async user => {
    const userWorkoutSignature = await juriNetworkProxyContract.methods
      .userWorkoutSignatures(roundIndex, user)
      .call()

    let lowestHash = 100e18
    let lowestIndex = -1

    for (let i = 0; i < bondedTokenAmount; i++) {
      const verifierHash = uint256(
        keccak256(userWorkoutSignature, myJuriNodeAddress, i)
      )

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

const sendCommitments = async assignedUsers => {
  const userAddresses = []
  const wasCompliantData = []
  const wasCompliantDataCommitments = []
  const proofIndices = []
  const randomNumbers = []

  await each(assignedUsers, async ({ address, lowestIndex }) => {
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

  await juriNetworkProxyContract.methods
    .addWasCompliantDataCommitmentsForUsers(
      userAddresses,
      wasCompliantDataCommitments,
      proofIndices
    )
    .send()

  return { randomNumbers, wasCompliantData }
}

const sendReveals = async ({
  assignedUsers,
  randomNumbers,
  wasCompliantData,
}) => {
  const userAddresses = assignedUsers.map(user => user.address)
  await juriNetworkProxyContract.methods
    .addWasCompliantDataForUsers(userAddresses, wasCompliantData, randomNumbers)
    .send()
}

const checkForInvalidAnswers = async ({ assignedUsers, wasCompliantData }) => {
  await each(assignedUsers, async (user, i) => {
    const acceptedAnswer = await juriNetworkProxyContract.methods
      .userComplianceData(roundIndex, user)
      .send()

    if (!!acceptedAnswer !== wasCompliantData[i])
      await juriNetworkProxyContract.methods
        .dissentToAcceptedAnswer(user)
        .send()
  })
}

const receiveDissentedUsers = () =>
  juriNetworkProxyContract.methods.dissentedUsers().call()

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
  // STAGE 2
  const assignedUsers = await retrieveAssignedUsers()

  const { randomNumbers, wasCompliantData } = await sendCommitments(
    assignedUsers
  )

  // STAGE 3
  await sendReveals({ assignedUsers, randomNumbers, wasCompliantData })
  await sleep(FIVE_MINUTES)

  // STAGE 4
  await checkForInvalidAnswers(assignedUsers)
  await sleep(FIVE_MINUTES)

  // STAGE 5
  const dissentedUsers = await receiveDissentedUsers()

  if (invalidAnswers.length > 0) {
    // STAGE 5.1
    const { randomNumbers, wasCompliantData } = await sendCommitments(
      dissentedUsers
    )
    await sleep(FIVE_MINUTES)

    // STAGE 5.2
    await sendReveals({ assignedUsers, randomNumbers, wasCompliantData })
    await sleep(FIVE_MINUTES)

    await slashDishonestNodes() // TODO
  }

  // STAGE 7
  // TODO move to next round
}

module.exports = runRound
