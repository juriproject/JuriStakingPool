const moveToNextStage = require('./moveToNextStage')
const {
  account,
  NetworkProxyContract,
  networkProxyAddress,
  privateKey,
  web3,
} = require('../config')
const { addUserHeartRateFiles, overwriteLog, sendTx } = require('../helpers')

const setupProxyForNewRound = async () => {
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

  await addUserHeartRateFiles()

  let currentStage = await NetworkProxyContract.methods.currentStage().call()

  overwriteLog('Moving to nodes adding commitments stage...')
  while (currentStage.toString() !== '1') {
    await moveToNextStage({ from: account, key: privateKey })
    currentStage = await NetworkProxyContract.methods.currentStage().call()
  }
  overwriteLog('Moved to nodes adding commitments stage!')
  process.stdout.write('\n')
}

module.exports = setupProxyForNewRound
