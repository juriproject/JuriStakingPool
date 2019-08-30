const {
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  nodes,
} = require('./config')

const runRound = require('./juriNode')
const setupProxyForNewRound = require('./juriNode/setupProxyForNewRound')

const waitForNextStage = require('./juriNode/waitForNextStage')

const NODE_COUNT = 16
const USER_COUNT = 16
const TIME_PER_STAGE = 1000 * 50

const runControllerRound = async ({ from, key, timePerStage }) => {
  for (let i = 0; i < 6; i++) {
    await waitForNextStage({ from, key, timePerStage, isMovingStage: true })
  }
}

const runRounds = async () => {
  const bondingAddress = await getBondingAddress()
  const BondingContract = await getBondingContract()

  const juriFeesTokenAdress = await getJuriFeesTokenAddress()
  const JuriFeesTokenContract = await getJuriFeesTokenContract()
  const juriTokenAddress = await getJuriTokenAddress()
  const JuriTokenContract = await getJuriTokenContract()

  const wasCompliantData = new Array(USER_COUNT).fill(false)

  const notRevealingConfig = new Array(NODE_COUNT).fill(false)
  const incorrectResultConfig = new Array(NODE_COUNT).fill(false)
  const offlineConfig = new Array(NODE_COUNT).fill(false)
  const incorrectDissentConfig = new Array(NODE_COUNT).fill(false)

  notRevealingConfig[3] = true
  notRevealingConfig[8] = true
  incorrectResultConfig[4] = true
  incorrectResultConfig[9] = true
  offlineConfig[5] = true
  offlineConfig[10] = true
  incorrectDissentConfig[6] = true

  await setupProxyForNewRound(USER_COUNT)

  // Start controller node
  runControllerRound({
    timePerStage: TIME_PER_STAGE,
    from: nodes[0].address,
    key: nodes[0].privateKeyBuffer,
  })

  // Start Juri nodes
  for (let nodeIndex = 1; nodeIndex < NODE_COUNT; nodeIndex++) {
    runRound({
      bondingAddress,
      BondingContract,
      maxUserCount: USER_COUNT,
      myJuriNodeAddress: nodes[nodeIndex].address,
      myJuriNodePrivateKey: nodes[nodeIndex].privateKeyBuffer,
      nodeIndex,
      timePerStage: TIME_PER_STAGE,
      wasCompliantData,
      failureOptions: {
        isNotRevealing: notRevealingConfig[nodeIndex],
        isSendingIncorrectResult: incorrectResultConfig[nodeIndex],
        isOffline: offlineConfig[nodeIndex],
        isSendingIncorrectDissent: incorrectDissentConfig[nodeIndex],
      },
    })
  }
}

runRounds()

module.exports = runRounds
