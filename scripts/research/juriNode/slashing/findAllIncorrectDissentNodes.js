const { NetworkProxyContract } = require('../../config')

const findAllIncorrectDissentNodes = async ({
  allNodes,
  dissentedUsers,
  roundIndex,
}) => {
  const incorrectDissentNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const hasDissented = await NetworkProxyContract.methods
        .getHasDissented(roundIndex, node, user)
        .call()
      const previousAnswer = await NetworkProxyContract.methods
        .getComplianceDataBeforeDissent(roundIndex, user)
        .call()
      const acceptedAnswer = await NetworkProxyContract.methods
        .getGivenNodeResult(roundIndex, node, user)
        .call()

      if (hasDissented && parseInt(previousAnswer) >= 0 === acceptedAnswer) {
        incorrectDissentNodes.push({ toSlash: node, user })
        break
      }
    }
  }

  return incorrectDissentNodes
}

module.exports = findAllIncorrectDissentNodes
