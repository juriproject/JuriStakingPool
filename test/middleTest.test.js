const itAddsNewUsersCorrectly = require('./addUserInNextPeriod.test')
const itRemovesNewUsersCorrectly = require('./removeUserInNextPeriod.test')
const itAddsComplianceDataCorrectly = require('./addComplianceData.test')
const itRunsFirstUpdateCorrectly = require('./firstUpdateStakeForNextXAmountOfUsers.test')
const itRunsSecondUpdateCorrectly = require('./secondUpdateStakeForNextXAmountOfUsers.test')

const itRunsCorrectlyWithFewUsers = async ({
  owner,
  user1,
  user2,
  user3,
  user4,
  user5,
  user6,
}) => {
  describe('when adding new users', async () => {
    describe('when there are only a few users', async () => {
      const addresses = [owner, user1, user2, user3]
      const addressesToAdd = [user4, user5, user6]

      itAddsNewUsersCorrectly({ addresses, addressesToAdd })
    })
  })

  describe('when removing users', async () => {
    describe('when there are only a few users', async () => {
      const addresses = [owner, user1, user2, user3]
      itRemovesNewUsersCorrectly(addresses)
    })
  })

  describe('when adding compliance data', async () => {
    describe('when there are only a few users', async () => {
      const addresses = [owner, user1, user2, user3]
      itAddsComplianceDataCorrectly(addresses)
    })
  })

  describe('when running the first update', async () => {
    describe('when there are only a few users', async () => {
      const addresses = [owner, user1, user2, user3]

      itRunsFirstUpdateCorrectly(addresses)
    })
  })

  describe('when running the second update', async () => {
    describe('when there are only a few users', async () => {
      const addresses = [owner, user1, user2, user3]

      itRunsSecondUpdateCorrectly(addresses)
    })
  })
}

module.exports = itRunsCorrectlyWithFewUsers
