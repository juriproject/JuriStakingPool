const { NetworkProxyContract, ZERO_ADDRESS } = require('../../config')

const findAllNotRevealedNodes = async ({ allNodes, allUsers, roundIndex }) => {
  const notRevealedNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < allUsers.length; j++) {
      const node = allNodes[i]
      const user = allUsers[j]

      const value = await NetworkProxyContract.methods
        .getUserComplianceDataCommitment(roundIndex, node, user)
        .call()

      if (
        value !== ZERO_ADDRESS &&
        !(await NetworkProxyContract.methods
          .getHasRevealed(roundIndex, node, user)
          .call())
      ) {
        notRevealedNodes.push({ toSlash: node, user })
        break
      }
    }
  }

  return notRevealedNodes
}

module.exports = findAllNotRevealedNodes
