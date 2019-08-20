const { NetworkProxyContract } = require('../../config')

const findAllIncorrectResultNodes = async ({
  allNodes,
  bondingAddress,
  dissentedUsers,
  roundIndex,
}) => {
  const incorrectResultNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const givenAnswer = await NetworkProxyContract.methods
        .getGivenNodeResult(roundIndex, node, user)
        .call()
      const acceptedAnswer =
        parseInt(
          await NetworkProxyContract.methods
            .getUserComplianceData(roundIndex, user)
            .call({ from: bondingAddress })
        ) >= 0

      if (givenAnswer !== acceptedAnswer) {
        incorrectResultNodes.push({ toSlash: node, user })
        break
      }
    }
  }

  return incorrectResultNodes
}

module.exports = findAllIncorrectResultNodes
