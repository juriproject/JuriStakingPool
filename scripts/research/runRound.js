const crypto = require('crypto')
const Heap = require('heap')
const Web3Utils = require('web3-utils')

const {
  account,
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  JuriStakingPoolWithOracleMockAbi,
  networkProxyAddress,
  NetworkProxyContract,
  nodes,
  privateKey,
  web3,
} = require('./config')

const { addUserHeartRateFiles, sendTx, overwriteLog } = require('./helpers')

const { BN } = web3.utils
const THRESHOLD = new BN(
  '115792089237316195423570985008687907853269984665640564039457584007913129639936'
)
const workoutSignature =
  '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100'

let allNodes, times

const sleep = require('util').promisify(setTimeout)

const moveToNextStage = async ({ originalAccount, originalPrivateKey }) => {
  overwriteLog('Moving to next stage...')
  await sendTx({
    data: NetworkProxyContract.methods.moveToNextStage().encodeABI(),
    from: originalAccount,
    to: networkProxyAddress,
    privateKey: originalPrivateKey,
    web3,
  })
  overwriteLog('Moved to next stage!')
}

const moveToAddingCommitmentsStage = async ({
  originalAccount,
  originalPrivateKey,
}) => {
  let currentStage = await NetworkProxyContract.methods.currentStage().call()

  overwriteLog('Moving to nodes adding commitments stage...')

  while (currentStage.toString() !== '1') {
    await moveToNextStage({ originalAccount, originalPrivateKey })

    currentStage = await NetworkProxyContract.methods.currentStage().call()
  }

  overwriteLog('Moved to nodes adding commitments stage!')
  process.stdout.write('\n')
}

const findAllNotRevealedNodes = async ({ allNodes, allUsers, roundIndex }) => {
  const notRevealedNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < allUsers.length; j++) {
      const node = allNodes[i]
      const user = allUsers[j]

      const value = await NetworkProxyContract.methods
        .getUserComplianceDataCommitment(roundIndex, node, user)
        .call()

      if (
        value !== 0x0 &&
        !(await NetworkProxyContract.methods
          .getHasRevealed(roundIndex, node, user)
          .call())
      ) {
        notRevealedNodes.push({ toSlash: node, user })
      }
    }
  }

  return notRevealedNodes
}

const findAllOfflineNodes = async ({
  allNodes,
  dissentedUsers,
  roundIndex,
}) => {
  const offlineNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const userWasDissented = await NetworkProxyContract.methods
        .dissented(roundIndex, user)
        .call()

      if (userWasDissented) {
        const commitment = await NetworkProxyContract.methods
          .getUserComplianceDataCommitment(roundIndex, node, _dissentedUser)
          .call()

        if (commitment == 0x0) offlineNodes.push({ toSlash: node, user })
      }
    }
  }

  return offlineNodes
}

const findAllIncorrectResultNodes = async ({
  allNodes,
  dissentedUsers,
  roundIndex,
}) => {
  const incorrectResultNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const givenAnswer = await NetworkProxyContract.methods
        .givenNodeResults(node, roundIndex, user)
        .call()
      const acceptedAnswer = await NetworkProxyContract.methods
        .givenNodeResults(roundIndex, user)
        .call()

      if (givenAnswer !== acceptedAnswer)
        incorrectResultNodes.push({ toSlash: node, user })
    }
  }

  return incorrectResultNodes
}

const findAllIncorrectDissentNodes = async ({
  allNodes,
  dissentedUsers,
  roundIndex,
}) => {
  const incorrectDissentNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const hasDissented = await NetworkProxyContract.methods
        .hasDissented(node, roundIndex, user)
        .call()
      const previousAnswer = await NetworkProxyContract.methods
        .userComplianceDataBeforeDissents(roundIndex, user)
        .call()
      const acceptedAnswer = await NetworkProxyContract.methods
        .givenNodeResults(roundIndex, user)
        .call()

      if (hasDissented && previousAnswer === acceptedAnswer)
        incorrectDissentNodes.push({ toSlash: node, user })
    }
  }

  return incorrectDissentNodes
}

const fetchAllNodes = BondingContract =>
  BondingContract.methods.getAllStakingNodes().call()

const fetchStageTimes = async () => {
  const stageNames = [
    'timeForAddingHeartRateData',
    'timeForCommitmentStage',
    'timeForRevealStage',
    'timeForDissentStage',
    'timeForDissentCommitmentStage',
    'timeForDissentRevealStage',
    'timeForSlashingStage',
  ]

  const stageTimes = []

  for (let i = 0; i < stageNames.length; i++) {
    stageTimes.push(await NetworkProxyContract.methods.timesForStages(i).call())
  }

  return stageNames.map((name, i) => ({ name, time: stageTimes[i] }))
}

const findLowestHashProofIndexes = ({ bondedStake, node }) => {
  const heap = new Heap((a, b) => (a.gt(b) ? -1 : 1))
  const hashesToProofIndex = {}

  for (let proofIndex = 0; proofIndex < bondedStake; proofIndex++) {
    const currentSmallest = heap.peek()
    const hash = new BN(
      Web3Utils.soliditySha3(workoutSignature, node, proofIndex).slice(2),
      16
    )

    if (proofIndex <= 3) {
      heap.push(hash)
      hashesToProofIndex[hash] = proofIndex
    } else if (currentSmallest.gt(hash)) {
      heap.pushpop(hash)
      hashesToProofIndex[hash] = proofIndex
    }
  }

  const lowestHashes = heap.toArray()
  const proofIndexes = lowestHashes.map(hash => hashesToProofIndex[hash])

  return { lowestHashes, proofIndexes }
}

const retrieveAssignedUsers = async ({ myJuriNodeAddress, roundIndex }) => {
  const poolAddresses = await NetworkProxyContract.methods
    .getRegisteredJuriStakingPools()
    .call()

  const users = []

  for (let i = 0; i < poolAddresses.length; i++) {
    const poolUsers = await new web3.eth.Contract(
      JuriStakingPoolWithOracleMockAbi,
      poolAddresses[i]
    ).methods
      .getUsers()
      .call()

    users.push(...poolUsers)
  }

  const uniqUsers = [...new Set(users)]
  const assignedUsers = []

  for (let i = 0; i < uniqUsers.length; i++) {
    const user = uniqUsers[i]

    const userWorkoutSignature = await NetworkProxyContract.methods
      .getUserWorkoutSignature(roundIndex, user)
      .call()

    let lowestHash = THRESHOLD
    let lowestIndex = -1

    const bondedTokenAmount = 10000 // TODO

    for (let i = 0; i < bondedTokenAmount; i++) {
      const hash = new BN(
        Web3Utils.soliditySha3(
          userWorkoutSignature,
          myJuriNodeAddress,
          i
        ).slice(2),
        16
      )

      if (lowestHash.gt(hash)) {
        lowestHash = hash
        lowestIndex = i
      }
    }

    if (THRESHOLD.gt(lowestHash))
      assignedUsers.push({
        address: user,
        lowestIndex,
        lowestHash: '0x' + lowestHash.toString(16).padStart(64, '0'),
      })
  }

  return { assignedUsers, uniqUsers }
}

const sendCommitments = async ({
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  users,
  isDissent,
}) => {
  const userAddresses = []
  const wasCompliantData = []
  const wasCompliantDataCommitments = []
  const proofIndices = []
  const randomNumbers = []

  for (let i = 0; i < users.length; i++) {
    const { address, lowestIndex } = users[i]

    // TODO
    /* const heartRateData = await downloadHeartRateData(address)
    const wasCompliant = verifyHeartRateData(heartRateData) */
    const wasCompliant = true
    const randomNumber = '0x' + crypto.randomBytes(32).toString('hex')
    const commitmentHash = Web3Utils.soliditySha3(wasCompliant, randomNumber)

    userAddresses.push(address)
    wasCompliantData.push(wasCompliant)
    wasCompliantDataCommitments.push(commitmentHash)
    proofIndices.push(lowestIndex)
    randomNumbers.push(randomNumber)
  }

  const addMethod = isDissent
    ? 'addDissentWasCompliantDataCommitmentsForUsers'
    : 'addWasCompliantDataCommitmentsForUsers'

  await sendTx({
    data: NetworkProxyContract.methods[addMethod](
      userAddresses,
      wasCompliantDataCommitments,
      proofIndices
    ).encodeABI(),
    from: myJuriNodeAddress,
    privateKey: myJuriNodePrivateKey,
    to: networkProxyAddress,
    web3,
  })

  return { randomNumbers, wasCompliantData }
}

const sendReveals = async ({
  users,
  randomNumbers,
  wasCompliantData,
  isDissent,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
}) => {
  const userAddresses = users.map(({ address }) => address)
  const addMethod = isDissent
    ? 'addDissentWasCompliantDataForUsers'
    : 'addWasCompliantDataForUsers'

  return sendTx({
    data: NetworkProxyContract.methods[addMethod](
      userAddresses,
      wasCompliantData,
      randomNumbers
    ).encodeABI(),
    from: myJuriNodeAddress,
    privateKey: myJuriNodePrivateKey,
    to: networkProxyAddress,
    web3,
  })
}

const checkForInvalidAnswers = async ({
  bondingAddress,
  roundIndex,
  users,
  wasCompliantData,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
}) => {
  for (let i = 0; i < users.length; i++) {
    const { address } = users[i]

    const acceptedAnswer = await NetworkProxyContract.methods
      .getUserComplianceData(roundIndex, address)
      .call({ from: bondingAddress })

    console.log({
      acceptedAnswer,
      wasCompliantData: wasCompliantData[i],
    })

    if (!!parseInt(acceptedAnswer) !== wasCompliantData[i])
      await sendTx({
        data: NetworkProxyContract.methods
          .dissentToAcceptedAnswer(address)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: networkProxyAddress,
        web3,
      })
  }
}

const receiveDissentedUsers = () =>
  NetworkProxyContract.methods.getDissentedUsers().call()

const retrieveRewards = async ({
  JuriTokenContract,
  juriTokenAddress,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  roundIndex,
}) => {
  await sendTx({
    data: JuriTokenContract.methods.retrieveRoundInflationRewards().encodeABI(),
    from: myJuriNodeAddress,
    privateKey: myJuriNodePrivateKey,
    to: juriTokenAddress,
    web3,
  })

  await sendTx({
    data: NetworkProxyContract.methods
      .retrieveRoundJuriFees(roundIndex)
      .encodeABI(),
    from: myJuriNodeAddress,
    privateKey: myJuriNodePrivateKey,
    to: networkProxyAddress,
    web3,
  })
}

const slashDishonestNodes = async ({
  allNodes,
  allUsers,
  dissentedUsers,
  bondingAddress,
  BondingContract,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  roundIndex,
}) => {
  const notRevealedNodes = await findAllNotRevealedNodes({
    allNodes,
    allUsers,
    roundIndex,
  })
  const offlineNodes = await findAllOfflineNodes({
    allNodes,
    dissentedUsers,
    roundIndex,
  })
  const incorrectResultNodes = await findAllIncorrectResultNodes({
    allNodes,
    dissentedUsers,
    roundIndex,
  })
  const incorrectDissentNodes = await findAllIncorrectDissentNodes({
    allNodes,
    dissentedUsers,
    roundIndex,
  })

  for (let i = 0; i < notRevealedNodes.length; i++) {
    const { toSlash, user } = notRevealedNodes[i]

    await sendTx({
      data: BondingContract.methods
        .slashStakeForNotRevealing(toSlash, user)
        .encodeABI(),
      from: myJuriNodeAddress,
      privateKey: myJuriNodePrivateKey,
      to: bondingAddress,
      web3,
    })
  }

  for (let i = 0; i < offlineNodes.length; i++) {
    const { toSlash, user } = notRevealedNodes[i]

    await sendTx({
      data: BondingContract.methods
        .slashStakeForBeingOffline(toSlash, user)
        .encodeABI(),
      from: myJuriNodeAddress,
      privateKey: myJuriNodePrivateKey,
      to: bondingAddress,
      web3,
    })
  }

  for (let i = 0; i < incorrectResultNodes.length; i++) {
    const { toSlash, user } = notRevealedNodes[i]

    await sendTx({
      data: BondingContract.methods
        .slashStakeForIncorrectResult(toSlash, user)
        .encodeABI(),
      from: myJuriNodeAddress,
      privateKey: myJuriNodePrivateKey,
      to: bondingAddress,
      web3,
    })
  }

  for (let i = 0; i < incorrectDissentNodes.length; i++) {
    const { toSlash, user } = notRevealedNodes[i]

    await sendTx({
      data: BondingContract.methods
        .slashStakeForIncorrectDissenting(toSlash, user)
        .encodeABI(),
      from: myJuriNodeAddress,
      privateKey: myJuriNodePrivateKey,
      to: bondingAddress,
      web3,
    })
  }
}

const getAssignedUsersIndexes = async ({
  myJuriNodeAddress,
  roundIndex,
  users,
}) => {
  const assignedUsersIndexes = []

  for (let i = 0; i < users.length; i++) {
    const wasAssignedToUser = await NetworkProxyContract.methods
      .getWasAssignedToUser(roundIndex, myJuriNodeAddress, users[i])
      .call()

    if (wasAssignedToUser) assignedUsersIndexes.push(i)
  }

  return assignedUsersIndexes
}

const runRound = async ({
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  isMovingStage,
  nodeIndex,
}) => {
  try {
    const originalAccount = account
    const originalPrivateKey = privateKey

    const bondingAddress = await getBondingAddress()
    const BondingContract = await getBondingContract()
    const juriFeesTokenAdress = await getJuriFeesTokenAddress()
    const JuriFeesTokenContract = await getJuriFeesTokenContract()
    const juriTokenAddress = await getJuriTokenAddress()
    const JuriTokenContract = await getJuriTokenContract()

    const roundIndex = await NetworkProxyContract.methods.roundIndex().call()

    // SETUP
    times = await fetchStageTimes()
    allNodes = await fetchAllNodes(BondingContract)

    // STAGE 2
    const { assignedUsers, uniqUsers } = await retrieveAssignedUsers({
      myJuriNodeAddress,
      roundIndex,
    })

    console.log({
      nodeIndex,
      assignedUsersCommitments: assignedUsers.map(
        ({ lowestHash }) => lowestHash
      ),
    })

    console.log(`Sending commitments... (node ${nodeIndex})`)
    const { randomNumbers, wasCompliantData } = await sendCommitments({
      users: assignedUsers,
      isDissent: false,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
    })
    console.log(`Sent commitments (node ${nodeIndex})!`)
    process.stdout.write('\n')

    console.log({ nodeIndex, randomNumbers, wasCompliantData })

    // await sleep(times[timeForCommitmentStage])
    if (isMovingStage) {
      await moveToNextStage({ originalAccount, originalPrivateKey })
      await sleep(9500)
    } else {
      await sleep(10000)
    }

    const finishedAssignedUsersIndexes = await getAssignedUsersIndexes({
      myJuriNodeAddress,
      roundIndex,
      users: uniqUsers,
    })

    console.log({ nodeIndex, finishedAssignedUsersIndexes })

    const mappedAssignedUsers = finishedAssignedUsersIndexes.map(
      index => assignedUsers[index]
    )
    const mappedRandomNumbers = finishedAssignedUsersIndexes.map(
      index => randomNumbers[index]
    )
    const mappedWasCompliantData = finishedAssignedUsersIndexes.map(
      index => wasCompliantData[index]
    )

    // STAGE 3
    console.log(`Sending reveals... (node ${nodeIndex})`)
    await sendReveals({
      users: mappedAssignedUsers,
      randomNumbers: mappedRandomNumbers,
      wasCompliantData: mappedWasCompliantData,
      isDissent: false,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
    })
    console.log(`Sent reveals (node ${nodeIndex})!`)
    process.stdout.write('\n')

    // await sleep(times[timeForRevealStage])
    if (isMovingStage) {
      await moveToNextStage({ originalAccount, originalPrivateKey })
      await sleep(9500)
    } else {
      await sleep(10000)
    }

    // STAGE 4
    console.log(`Dissenting to invalid answers... (node ${nodeIndex})`)
    await checkForInvalidAnswers({
      bondingAddress,
      roundIndex,
      users: assignedUsers,
      wasCompliantData,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
    })
    console.log(`Dissented to invalid answers (node ${nodeIndex})!`)
    process.stdout.write('\n')

    // await sleep(times[timeForDissentStage])
    if (isMovingStage) {
      await moveToNextStage({ originalAccount, originalPrivateKey })
      await sleep(9500)
    } else {
      await sleep(10000)
    }

    // STAGE 5
    const dissentedUsers = await receiveDissentedUsers()

    console.log({ nodeIndex, dissentedUsers })

    if (dissentedUsers.length > 0) {
      // STAGE 5.1
      const { randomNumbers, wasCompliantData } = await sendCommitments({
        users: dissentedUsers,
        isDissent: true,
        myJuriNodeAddress,
        myJuriNodePrivateKey,
      })

      // await sleep(times[timeForDissentCommitmentStage])
      if (isMovingStage) {
        await moveToNextStage({ originalAccount, originalPrivateKey })
        await sleep(9500)
      } else {
        await sleep(10000)
      }

      // STAGE 5.2
      await sendReveals({
        users: dissentedUsers,
        randomNumbers,
        wasCompliantData,
        isDissent: true,
        myJuriNodeAddress,
        myJuriNodePrivateKey,
      })

      // await sleep(times[timeForDissentRevealStage])
      if (isMovingStage) {
        await moveToNextStage({ originalAccount, originalPrivateKey })
        await sleep(9500)
      } else {
        await sleep(10000)
      }
    }

    // FINISH UP
    /* const balanceJuriTokenBefore = (await JuriTokenContract.methods
      .balanceOf(myJuriNodeAddress)
      .call()).toString()
    const balanceJuriFeesTokenBefore = (await JuriFeesTokenContract.methods
      .balanceOf(myJuriNodeAddress)
      .call()).toString()
  
    await retrieveRewards({ JuriTokenContract, juriTokenAddress, roundIndex })
  
    const balanceJuriTokenAfter = (await JuriTokenContract.methods
      .balanceOf(myJuriNodeAddress)
      .call()).toString()
    const balanceJuriFeesTokenAfter = (await JuriFeesTokenContract.methods
      .balanceOf(myJuriNodeAddress)
      .call()).toString()
  
    console.log({ balanceJuriTokenBefore, balanceJuriTokenAfter })
    console.log({ balanceJuriFeesTokenBefore, balanceJuriFeesTokenAfter }) */

    console.log(`Slashing dishonest nodes... (node ${nodeIndex})`)
    await slashDishonestNodes({
      allNodes,
      allUsers: uniqUsers,
      dissentedUsers,
      bondingAddress,
      BondingContract,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
      roundIndex,
    })
    console.log(`Dishonest nodes slashed (node ${nodeIndex})!`)
    process.stdout.write('\n')

    // await sleep(times[timeForSlashingStage])

    // STAGE 7
    // await moveToNextRound()
  } catch (error) {
    console.log({ nodeIndex, errorMessage: error.message })
  }
}

const exec = async () => {
  overwriteLog('Increase round index...')
  await sendTx({
    data: NetworkProxyContract.methods.debugIncreaseRoundIndex().encodeABI(),
    from: account,
    to: networkProxyAddress,
    privateKey,
    web3,
  })
  overwriteLog('Increased round index!')
  process.stdout.write('\n')

  const fileNames = await addUserHeartRateFiles()
  console.log({ fileNames })

  await moveToAddingCommitmentsStage({
    originalAccount: account,
    originalPrivateKey: privateKey,
  })

  const myJuriNodeAddress0 = nodes[0].address
  const myJuriNodePrivateKey0 = nodes[0].privateKeyBuffer
  const myJuriNodeAddress1 = nodes[1].address
  const myJuriNodePrivateKey1 = nodes[1].privateKeyBuffer
  const myJuriNodeAddress2 = nodes[2].address
  const myJuriNodePrivateKey2 = nodes[2].privateKeyBuffer
  const myJuriNodeAddress3 = nodes[3].address
  const myJuriNodePrivateKey3 = nodes[3].privateKeyBuffer
  const myJuriNodeAddress4 = nodes[4].address
  const myJuriNodePrivateKey4 = nodes[4].privateKeyBuffer
  const myJuriNodeAddress5 = nodes[5].address
  const myJuriNodePrivateKey5 = nodes[5].privateKeyBuffer

  runRound({
    myJuriNodeAddress: myJuriNodeAddress0,
    myJuriNodePrivateKey: myJuriNodePrivateKey0,
    isMovingStage: true,
    nodeIndex: 0,
  })
  runRound({
    myJuriNodeAddress: myJuriNodeAddress1,
    myJuriNodePrivateKey: myJuriNodePrivateKey1,
    isMovingStage: false,
    nodeIndex: 1,
  })
  runRound({
    myJuriNodeAddress: myJuriNodeAddress2,
    myJuriNodePrivateKey: myJuriNodePrivateKey2,
    isMovingStage: false,
    nodeIndex: 2,
  })
  runRound({
    myJuriNodeAddress: myJuriNodeAddress3,
    myJuriNodePrivateKey: myJuriNodePrivateKey3,
    isMovingStage: false,
    nodeIndex: 3,
  })
  runRound({
    myJuriNodeAddress: myJuriNodeAddress4,
    myJuriNodePrivateKey: myJuriNodePrivateKey4,
    isMovingStage: false,
    nodeIndex: 4,
  })
  runRound({
    myJuriNodeAddress: myJuriNodeAddress5,
    myJuriNodePrivateKey: myJuriNodePrivateKey5,
    isMovingStage: false,
    nodeIndex: 5,
  })
}

exec()

module.exports = runRound
