const itAddsNewUsersCorrectly = require('./addUserInNextPeriod.test')
const itRemovesNewUsersCorrectly = require('./removeUserInNextPeriod.test')
const itAddsComplianceDataCorrectly = require('./addComplianceData.test')
const itRunsFirstUpdateCorrectly = require('./firstUpdateStakeForNextXAmountOfUsers.test')
const itRunsSecondUpdateCorrectly = require('./secondUpdateStakeForNextXAmountOfUsers.test')

const itRunsCorrectlyWithOneUser = async ({ addresses, addressesToAdd }) => {
  describe('when there is only one user', async () => {
    describe('when adding new users', async () => {
      itAddsNewUsersCorrectly({ addresses, addressesToAdd })
    })

    describe('when removing users', async () => {
      itRemovesNewUsersCorrectly(addresses)
    })

    describe('when adding compliance data', async () => {
      itAddsComplianceDataCorrectly(addresses)
    })

    describe('when running the first update', async () => {
      itRunsFirstUpdateCorrectly(addresses)
    })

    describe('when running the second update', async () => {
      itRunsSecondUpdateCorrectly(addresses)
    })
  })
}

const itRunsCorrectlyWithManyUsers = async ({ addresses, addressesToAdd }) => {
  describe('when adding new users', async () => {
    describe('when there are many users', async () => {
      itAddsNewUsersCorrectly({ addresses, addressesToAdd })
    })
  })

  describe('when removing users', async () => {
    describe('when there are many users', async () => {
      itRemovesNewUsersCorrectly(addresses)
    })
  })

  describe('when adding compliance data', async () => {
    describe('when there are many users', async () => {
      itAddsComplianceDataCorrectly(addresses)
    })
  })

  describe('when running the first update', async () => {
    describe('when there are many users', async () => {
      itRunsFirstUpdateCorrectly(addresses)
    })
  })

  describe('when running the second update', async () => {
    describe('when there are many users', async () => {
      itRunsSecondUpdateCorrectly(addresses)
    })
  })
}

module.exports = { itRunsCorrectlyWithManyUsers, itRunsCorrectlyWithOneUser }
