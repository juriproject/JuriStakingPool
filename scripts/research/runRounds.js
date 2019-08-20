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

  const wasCompliantData = [false, false, false, false, false, false]

  const notRevealingConfig = [false, true, false, false, false, false]
  const incorrectResultConfig = [false, false, false, false, false, false]
  const offlineConfig = [false, false, false, false, false, false]
  const incorrectDissentConfig = [false, false, false, false, false, false]

  for (let nodeIndex = 0; nodeIndex < 6; nodeIndex++) {
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
