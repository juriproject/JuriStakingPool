const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { sendTx } = require('../helpers')

const checkForInvalidAnswers = async ({
  bondingAddress,
  roundIndex,
  users,
  wasCompliantData,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  nodeIndex,
}) => {
  for (let i = 0; i < users.length; i++) {
    const { address } = users[i]

    const acceptedAnswer = await NetworkProxyContract.methods
      .getUserComplianceData(roundIndex, address)
      .call({ from: bondingAddress })
    const wasAssignedToUser = await NetworkProxyContract.methods
      .getWasAssignedToUser(roundIndex, myJuriNodeAddress, address)
      .call()
    const isDissented = await NetworkProxyContract.methods
      .getDissented(roundIndex, address)
      .call()

    if (
      wasAssignedToUser &&
      parseInt(acceptedAnswer) >= 0 !== wasCompliantData[i] &&
      !isDissented
      // = 0 because 0 is considered a compliant user (when in doubt, give user the benefit)
    ) {
      try {
        await sendTx({
          data: NetworkProxyContract.methods
            .dissentToAcceptedAnswer(address)
            .encodeABI(),
          from: myJuriNodeAddress,
          privateKey: myJuriNodePrivateKey,
          to: networkProxyAddress,
          web3,
        })
      } catch (error) {
        console.log({
          nodeIndex,
          DissentError: error.message,
        })
      }
    }
  }
}

module.exports = checkForInvalidAnswers
