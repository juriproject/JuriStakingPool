const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { sendTx } = require('../helpers')

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

module.exports = retrieveRewards
