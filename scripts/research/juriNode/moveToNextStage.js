const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { sendTx } = require('../helpers')

const moveToNextStage = async ({ from, key }) => {
  await sendTx({
    data: NetworkProxyContract.methods.moveToNextStage().encodeABI(),
    from,
    to: networkProxyAddress,
    privateKey: key,
    web3,
  })
}

module.exports = moveToNextStage
