const { BN, ether } = require('openzeppelin-test-helpers')
const { expect } = require('chai')

const JuriStakingPool = artifacts.require('./JuriStakingPool.sol')
const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')

const ONE_HUNDRED_ETHER = ether('100')
const ONE_TOKEN = ether('1')
const ONE_HUNDRED_TOKEN = ether('100')
const ONE_DAY = 60 * 60 * 24

const logPoolState = async pool => {
  const userCount = (await pool.getPoolUserCount()).toString()
  const currentTotalPayout = (await pool.currentTotalPayout()).toString()
  const currentTotalStakeToSlash = (await pool.currentTotalStakeToSlash()).toString()
  const currentNonCompliancePenalty = (await pool.currentNonCompliancePenalty()).toString()
  const currentStakingPeriodIndex = (await pool.currentStakingPeriodIndex()).toString()
  const updateStakingIndex = (await pool.updateStakingIndex()).toString()
  const updateStaking2Index = (await pool.updateStaking2Index()).toString()
  const complianceDataIndex = (await pool.complianceDataIndex()).toString()

  console.log({
    userCount,
    currentTotalPayout,
    currentTotalStakeToSlash,
    currentNonCompliancePenalty,
    currentStakingPeriodIndex,
    updateStakingIndex,
    updateStaking2Index,
    complianceDataIndex,
  })
}

const logUserBalancesForFirstPeriods = async ({ users, pool }) => {
  const stakesAt0 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(0, user).then(r => r.toString()))
  )

  const stakesAt1 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(1, user).then(r => r.toString()))
  )

  const stakesAt2 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(2, user).then(r => r.toString()))
  )

  const stakesAt3 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(3, user).then(r => r.toString()))
  )

  const stakesAt4 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(4, user).then(r => r.toString()))
  )

  const stakesAt5 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(5, user).then(r => r.toString()))
  )

  const stakesAt6 = await Promise.all(
    users.map(user => pool.stakePerUserAtIndex(6, user).then(r => r.toString()))
  )

  console.log({
    stakesAt0,
    stakesAt1,
    stakesAt2,
    stakesAt3,
    stakesAt4,
    stakesAt5,
    stakesAt6,
  })
}

const approveAndAddStake = ({ pool, stake, token, user }) =>
  token
    .approve(pool.address, stake, { from: user })
    .then(() => pool.addMoreStakeForNextPeriod({ from: user }))

contract('JuriStakingPool', ([owner, user1, user2, user3, user4]) => {
  let juriStakingPool, token

  const defaultPeriodLength = new BN(7 * ONE_DAY)
  const defaultFeePercentage = new BN(1)
  const defaultCompliantGainPercentage = new BN(4)
  const defaultMaxNonCompliantPenaltyPercentage = new BN(5)
  const defaultMinStakePerUser = ONE_TOKEN
  const defaultMaxStakePerUser = ONE_HUNDRED_TOKEN
  const defaultUpdateIterationCount = new BN(500)

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

  const initialPoolSetup = async ({ pool, poolUsers, poolStakes }) => {
    await pool.addUserInNextPeriod(user1)
    await pool.addUserInNextPeriod(user2)
    await pool.addUserInNextPeriod(user3)
    await pool.addUserInNextPeriod(user4)

    await Promise.all(
      poolUsers.map((user, i) =>
        approveAndAddStake({ pool, stake: poolStakes[i], token, user })
      )
    )

    await pool.addWasCompliantDataForUsers([])
    await pool.firstUpdateStakeForNextXAmountOfUsers()
    await pool.secondUpdateStakeForNextXAmountOfUsers([])

    console.log('************ After first period ************')
    await logPoolState(pool)
  }

  const runPoolRound = async ({ complianceData, pool, poolUsers }) => {
    console.log('************ Balances before round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    })

    await pool.addWasCompliantDataForUsers(complianceData)
    await pool.firstUpdateStakeForNextXAmountOfUsers()

    // console.log('************ State in middle of round ************')
    // await logPoolState(pool)

    await pool.secondUpdateStakeForNextXAmountOfUsers([])

    console.log('************ State after round ************')
    await logPoolState(pool)

    console.log('************ Balances after round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    })
  }

  describe('when staking', async () => {
    beforeEach(async () => await deployJuriStakingPool())

    it('sets periodLength', async () => {
      const periodLength = await juriStakingPool.periodLength()
      expect(periodLength).to.be.bignumber.equal(defaultPeriodLength)
    })

    it('sets feePercentage', async () => {
      const feePercentage = await juriStakingPool.feePercentage()
      expect(feePercentage).to.be.bignumber.equal(defaultFeePercentage)
    })

    it('sets compliantGainPercentage', async () => {
      const compliantGainPercentage = await juriStakingPool.compliantGainPercentage()
      expect(compliantGainPercentage).to.be.bignumber.equal(
        defaultCompliantGainPercentage
      )
    })

    it('sets maxNonCompliantPenaltyPercentage', async () => {
      const maxNonCompliantPenaltyPercentage = await juriStakingPool.maxNonCompliantPenaltyPercentage()
      expect(maxNonCompliantPenaltyPercentage).to.be.bignumber.equal(
        defaultMaxNonCompliantPenaltyPercentage
      )
    })

    it('sets minStakePerUser', async () => {
      const minStakePerUser = await juriStakingPool.minStakePerUser()
      expect(minStakePerUser).to.be.bignumber.equal(defaultMinStakePerUser)
    })

    it('sets maxStakePerUser', async () => {
      const maxStakePerUser = await juriStakingPool.maxStakePerUser()
      expect(maxStakePerUser).to.be.bignumber.equal(defaultMaxStakePerUser)
    })

    it('sets updateIterationCount', async () => {
      const updateIterationCount = await juriStakingPool.updateIterationCount()
      expect(updateIterationCount).to.be.bignumber.equal(
        defaultUpdateIterationCount
      )
    })

    it.only('stakes', async () => {
      const poolUsers = [user1, user2, user3, user4]
      const poolStakes = [1000, 1000, 1000, 1000]

      await initialPoolSetup({ pool: juriStakingPool, poolUsers, poolStakes })

      const complianceData = [
        [false, false, true, true],
        [false, false, true, true],
        [false, false, false, false],
        [true, true, true, true],
      ]
      const poolRounds = 4

      for (let i = 0; i < poolRounds; i++) {
        await runPoolRound({
          complianceData: complianceData[i],
          pool: juriStakingPool,
          poolUsers,
        })
      }

      const userBalances = await Promise.all(
        poolUsers.map(user =>
          juriStakingPool.getStakeForUserInCurrentPeriod({
            from: user,
          })
        )
      )

      const compliantFactor = new BN(100).add(defaultCompliantGainPercentage)

      const expectedUserBalances = []
      poolUsers.forEach((_, i) =>
        expectedUserBalances.push(new BN(poolStakes[i]))
      )

      for (let j = 0; j < poolRounds; j++) {
        let stakeToSlash = new BN(0)
        let totalPayout = new BN(0)

        poolUsers.forEach((_, i) => {
          if (complianceData[j][i]) {
            const newStake = expectedUserBalances[i]
              .mul(compliantFactor)
              .div(new BN(100))
            const gain = newStake.sub(expectedUserBalances[i])
            totalPayout = totalPayout.add(gain)
          } else {
            stakeToSlash = stakeToSlash.add(new BN(poolStakes[i]))
          }
        })

        const nonCompliantPenaltiy = stakeToSlash.gt(new BN(0))
          ? Math.min(
              totalPayout.mul(new BN(100)).div(stakeToSlash),
              defaultMaxNonCompliantPenaltyPercentage
            )
          : defaultMaxNonCompliantPenaltyPercentage
        const nonCompliantFactor = new BN(100).sub(new BN(nonCompliantPenaltiy))

        poolUsers.forEach((_, i) => {
          expectedUserBalances[i] = expectedUserBalances[i]
            .mul(complianceData[j][i] ? compliantFactor : nonCompliantFactor)
            .div(new BN(100))
        })
      }

      poolUsers.forEach((_, i) =>
        expect(userBalances[i]).to.be.bignumber.equal(expectedUserBalances[i])
      )
    })
  })
})
