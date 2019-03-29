const { BN, ether } = require('openzeppelin-test-helpers')
const { expect } = require('chai')

const JuriStakingPool = artifacts.require('./JuriStakingPool.sol')
const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')

const ONE_HUNDRED_ETHER = ether('100')
const ONE_TOKEN = ether('1')
const ONE_HUNDRED_TOKEN = ether('100')
const ONE_DAY = 60 * 60 * 24

contract('JuriStakingPool', ([owner, user1, user2, user3, user4]) => {
  let juriStakingPool, token

  const defaultPeriodLength = new BN(7 * ONE_DAY)
  const defaultFeePercentage = 1
  const defaultCompliantGainPercentage = 10
  const defaultMaxNonCompliantPenaltyPercentage = 5
  const defaultMinStakePerUser = ONE_TOKEN
  const defaultMaxStakePerUser = ONE_HUNDRED_TOKEN
  const defaultUpdateIterationCount = 500

  const deployJuriStakingPool = async ({
    periodLength = defaultPeriodLength,
    feePercentage = defaultFeePercentage,
    compliantGainPercentage = defaultCompliantGainPercentage,
    maxNonCompliantPenaltyPercentage = defaultMaxNonCompliantPenaltyPercentage,
    minStakePerUser = defaultMinStakePerUser,
    maxStakePerUser = defaultMaxStakePerUser,
    updateIterationCount = defaultUpdateIterationCount,
  } = {}) => {
    token = await ERC20Mintable.new()
    await token.mint(owner, ONE_HUNDRED_ETHER)
    await token.mint(user1, ONE_HUNDRED_ETHER)
    await token.mint(user2, ONE_HUNDRED_ETHER)
    await token.mint(user3, ONE_HUNDRED_ETHER)
    await token.mint(user4, ONE_HUNDRED_ETHER)

    juriStakingPool = await JuriStakingPool.new(
      token.address,
      periodLength,
      feePercentage,
      compliantGainPercentage,
      maxNonCompliantPenaltyPercentage,
      minStakePerUser,
      maxStakePerUser,
      updateIterationCount
    )
  }

  describe('when staking', async () => {
    beforeEach(async () => await deployJuriStakingPool())

    it('sets periodLength', async () => {
      const periodLength = await juriStakingPool.periodLength()

      expect(periodLength).to.be.bignumber.equal(defaultPeriodLength)
    })

    it('stakes', async () => {
      await juriStakingPool.addUser(user1)
      await juriStakingPool.addUser(user2)
      await juriStakingPool.addUser(user3)
      await juriStakingPool.addUser(user4)

      await token.approve(juriStakingPool.address, 1000, { from: user1 })
      await token.approve(juriStakingPool.address, 1000, { from: user2 })
      await token.approve(juriStakingPool.address, 1000, { from: user3 })
      await token.approve(juriStakingPool.address, 1000, { from: user4 })

      await juriStakingPool.addMoreStakeForNextPeriod({ from: user1 })
      await juriStakingPool.addMoreStakeForNextPeriod({ from: user2 })
      await juriStakingPool.addMoreStakeForNextPeriod({ from: user3 })
      await juriStakingPool.addMoreStakeForNextPeriod({ from: user4 })
      await juriStakingPool.testOnlyIncreaseStakingPeriod()

      const stakeUser1Before = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user1
      )).toString()
      const stakeUser2Before = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user2
      )).toString()
      const stakeUser3Before = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user3
      )).toString()
      const stakeUser4Before = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user4
      )).toString()

      const complianceData = [false, false, true, true]
      await juriStakingPool.addWasCompliantDataForUsers(complianceData)
      await juriStakingPool.addWasCompliantDataForUsers(complianceData)

      await juriStakingPool.firstUpdateStakeForNextXAmountOfUsers()

      const currentTotalPayout = (await juriStakingPool.currentTotalPayout()).toString()
      const currentTotalStakeToSlash = (await juriStakingPool.currentTotalStakeToSlash()).toString()
      const currentNonCompliancePenalty = (await juriStakingPool.currentNonCompliancePenalty()).toString()
      console.log({
        currentTotalPayout,
        currentTotalStakeToSlash,
        currentNonCompliancePenalty,
      })

      await juriStakingPool.secondUpdateStakeForNextXAmountOfUsers()

      const stakeUser1After = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user1
      )).toString()
      const stakeUser2After = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user2
      )).toString()
      const stakeUser3After = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user3
      )).toString()
      const stakeUser4After = (await juriStakingPool.stakePerUserAtIndex(
        1,
        user4
      )).toString()

      console.log({ stakeUser1Before, stakeUser1After })
      console.log({ stakeUser2Before, stakeUser2After })
      console.log({ stakeUser3Before, stakeUser3After })
      console.log({ stakeUser4Before, stakeUser4After })

      expect(true).to.be.equal(false)
    })
  })
})
