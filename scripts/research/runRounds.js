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

const runRounds = async () => {
  await setupProxyForNewRound()

  const bondingAddress = await getBondingAddress()
  const BondingContract = await getBondingContract()

  const juriFeesTokenAdress = await getJuriFeesTokenAddress()
  const JuriFeesTokenContract = await getJuriFeesTokenContract()
  const juriTokenAddress = await getJuriTokenAddress()
  const JuriTokenContract = await getJuriTokenContract()

  const NODE_COUNT = 6
  const USER_COUNT = 20

  const wasCompliantData = new Array(USER_COUNT).fill(false)

  const notRevealingConfig = new Array(NODE_COUNT).fill(false)
  const incorrectResultConfig = new Array(NODE_COUNT).fill(false)
  const offlineConfig = new Array(NODE_COUNT).fill(false)
  const incorrectDissentConfig = new Array(NODE_COUNT).fill(false)

  for (let nodeIndex = 0; nodeIndex < NODE_COUNT; nodeIndex++) {
    runRound({
      bondingAddress,
      BondingContract,
      isMovingStage: nodeIndex === 0,
      myJuriNodeAddress: nodes[nodeIndex].address,
      myJuriNodePrivateKey: nodes[nodeIndex].privateKeyBuffer,
      nodeIndex,
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
