const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { parseRevertMessage, sendTx } = require('../helpers')

const checkForInvalidAnswers = async ({
  bondingAddress,
  roundIndex,
  users,
  isSendingIncorrectDissent,
  wasCompliantData,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  nodeIndex,
}) => {
  const usersToDissent = []

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
      (wasAssignedToUser && isSendingIncorrectDissent) ||
      (wasAssignedToUser &&
        parseInt(acceptedAnswer) >= 0 !== wasCompliantData[i] &&
        !isDissented)
      // = 0 because 0 is considered a compliant user (when in doubt, give user the benefit)
    ) {
      usersToDissent.push(address)
    }
  }

  if (usersToDissent.length > 0)
    try {
      console.log(`Sending dissent for users... (node ${nodeIndex})`)
      await sendTx({
        data: NetworkProxyContract.methods
          .dissentToAcceptedAnswers(usersToDissent)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: networkProxyAddress,
        web3,
      })
    } catch (error) {
      console.log({
        nodeIndex,
        DissentError: parseRevertMessage(error.message),
      })
    }
}

module.exports = checkForInvalidAnswers
