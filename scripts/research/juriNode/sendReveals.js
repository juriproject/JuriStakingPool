const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { sendTx } = require('../helpers')

const sendReveals = async ({
  users,
  randomNumbers,
  wasCompliantData,
  isDissent,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
}) => {
  const userAddresses = isDissent ? users : users.map(({ address }) => address)
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

module.exports = sendReveals
