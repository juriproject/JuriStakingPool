const Heap = require('heap')
const Web3Utils = require('web3-utils')

const {
  account,
  Ether1e17,
  fileStorage,
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  JuriStakingPoolWithOracleMockAbi,
  networkProxyAddress,
  NetworkProxyContract,
  oneEther,
  PoolAbi,
  privateKey,
  web3,
} = require('./config')

const { sendTx, overwriteLog } = require('./helpers')

const BN = web3.utils.BN
const THRESHOLD = new BN(
  '115792089237316195423570985008687907853269984665640564039457584007913129639936'
)
const workoutSignature =
  '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100'

let allNodes, myJuriNodeAddress, times

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

const retrieveAssignedUsers = async roundIndex => {
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

  console.log({ users })

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

  return assignedUsers
}

const runRound = async roundIndex => {
  const originalAccount = account
  const originalPrivateKey = privateKey

  const bondingAddress = await getBondingAddress()
  const BondingContract = await getBondingContract()
  const juriFeesTokenAdress = await getJuriFeesTokenAddress()
  const JuriFeesTokenContract = await getJuriFeesTokenContract()
  const juriTokenAddress = await getJuriTokenAddress()
  const JuriTokenContract = await getJuriTokenContract()

  // SETUP
  times = await fetchStageTimes()
  console.log({ times })

  allNodes = await fetchAllNodes(BondingContract)
  console.log({ allNodes })

  myJuriNodeAddress = allNodes[0]

  // STAGE 2
  const assignedUsers = await retrieveAssignedUsers(roundIndex)

  console.log({ assignedUsers })

  /* const { randomNumbers, wasCompliantData } = await sendCommitments({
    users: assignedUsers,
    isDissent: false,
  })
  await sleep(timeForCommitmentStage) */

  /* // STAGE 3
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

  // FINISH UP
  await retrieveRewards()
  await slashDishonestNodes(dissentedUsers)
  await sleep(timeForSlashingStage)

  // STAGE 7
  await moveToNextRound() */
}

runRound(0)

module.exports = runRound
