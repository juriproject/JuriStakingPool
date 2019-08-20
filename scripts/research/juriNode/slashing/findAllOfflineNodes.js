const { NetworkProxyContract } = require('../../config')

const findAllOfflineNodes = async ({
  allNodes,
  dissentedUsers,
  roundIndex,
}) => {
  const offlineNodes = []

  for (let i = 0; i < allNodes.length; i++) {
    for (let j = 0; j < dissentedUsers.length; j++) {
      const node = allNodes[i]
      const user = dissentedUsers[j]

      const userWasDissented = await NetworkProxyContract.methods
        .getDissented(roundIndex, user)
        .call()

      if (userWasDissented) {
        const commitment = await NetworkProxyContract.methods
          .getUserComplianceDataCommitment(roundIndex, node, user)
          .call()

        if (commitment == 0x0) {
          offlineNodes.push({ toSlash: node, user })
          break
        }
      }
    }
  }

  return offlineNodes
}

module.exports = findAllOfflineNodes
