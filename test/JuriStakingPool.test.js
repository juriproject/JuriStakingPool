const { setDefaultJuriAddress } = require('./defaults')

const { deployJuriStakingPool, itSetsPoolDefinition } = require('./helpers')

const itRunsPoolRoundsCorrectly = require('./shortTest.test')
const itRunsCorrectlyWithFewUsers = require('./middleTest.test')
const {
  itRunsCorrectlyWithOneUser,
  itRunsCorrectlyWithManyUsers,
} = require('./fullTest.test')

contract('JuriStakingPool', accounts => {
  let juriStakingPool
  const [owner, user1, user2, user3, user4, user5, user6] = accounts

  beforeEach(() => setDefaultJuriAddress(owner))

  describe('when staking', async () => {
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [owner, user1, user2, user3, user4],
      })

      juriStakingPool = deployedContracts.pool
      token = deployedContracts.token
    })

    if (process.env.TESTING_MODE === 'QUICK_TESTING') {
      describe('when running pool rounds', async () => {
        it('runs them correctly', async () => {
          itRunsPoolRoundsCorrectly({
            pool: juriStakingPool,
            token,
            user1,
            user2,
            user3,
            user4,
          })
        })
      })
    } else {
      it('sets poolDefinition', async () => {
        itSetsPoolDefinition(juriStakingPool)
      })
      if (process.env.TESTING_MODE === 'FULL_TESTING') {
        itRunsCorrectlyWithOneUser({
          addresses: [owner, user1],
          addressesToAdd: [user2, user3, user4],
        })
        itRunsCorrectlyWithManyUsers({
          addresses: accounts.slice(0, accounts.length - 3),
          addressesToAdd: accounts.slice(accounts.length - 3),
        })
      } else {
        itRunsCorrectlyWithFewUsers({
          owner,
          user1,
          user2,
          user3,
          user4,
          user5,
          user6,
        })
      }
    }
  })
})
