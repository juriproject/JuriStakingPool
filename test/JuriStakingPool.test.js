const { expect } = require('chai')
const { time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultMinStakePerUser,
  defaultMaxStakePerUser,
  defaultMaxTotalStake,
  setDefaultJuriAddress,
} = require('./defaults')

const { deployJuriStakingPool } = require('./helpers')

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

    if (process.env.QUICK_TESTING === 'true') {
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
        const poolDefinition = await juriStakingPool.poolDefinition()
        const {
          compliantGainPercentage,
          feePercentage,
          maxNonCompliantPenaltyPercentage,
          maxStakePerUser,
          minStakePerUser,
          maxTotalStake,
          periodLength,
          startTime,
        } = poolDefinition

        expect(periodLength).to.be.bignumber.equal(defaultPeriodLength)
        expect(feePercentage).to.be.bignumber.equal(defaultFeePercentage)
        expect(compliantGainPercentage).to.be.bignumber.equal(
          defaultCompliantGainPercentage
        )
        expect(maxNonCompliantPenaltyPercentage).to.be.bignumber.equal(
          defaultMaxNonCompliantPenaltyPercentage
        )
        expect(minStakePerUser).to.be.bignumber.equal(defaultMinStakePerUser)
        expect(maxStakePerUser).to.be.bignumber.equal(defaultMaxStakePerUser)
        expect(maxTotalStake).to.be.bignumber.equal(defaultMaxTotalStake)

        const expectedEarliestTime = await time.latest()
        const expectedLatestTime = (await time.latest()).add(
          time.duration.seconds(40)
        )
        expect(startTime).to.be.bignumber.gt(expectedEarliestTime)
        expect(startTime).to.be.bignumber.lt(expectedLatestTime)
      })
      if (process.env.FULL_TESTING === 'true') {
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
