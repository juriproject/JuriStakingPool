const { NetworkProxyContract } = require('../config')

const getAssignedUsersIndexes = async ({
  myJuriNodeAddress,
  roundIndex,
  users,
}) => {
  const assignedUsersIndexes = []

  for (let i = 0; i < users.length; i++) {
    const wasAssignedToUser = await NetworkProxyContract.methods
      .getWasAssignedToUser(roundIndex, myJuriNodeAddress, users[i])
      .call()

    if (wasAssignedToUser) assignedUsersIndexes.push(i)
  }

  return assignedUsersIndexes
}

module.exports = getAssignedUsersIndexes
