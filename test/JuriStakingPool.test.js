const { BN, ether, shouldFail } = require('openzeppelin-test-helpers')
const { expect } = require('chai')

const JuriStakingPool = artifacts.require('./JuriStakingPool.sol')
const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')

const ONE_HUNDRED_ETHER = ether('100')
const ONE_TOKEN = ether('1')
const ONE_HUNDRED_TOKEN = ether('100')
const TWO_HUNDRED_TOKEN = ether('200')
const ONE_DAY = 60 * 60 * 24

const logger = msg => {
  if (process.env.DEBUG === 'true') console.log(msg)
}

const logPoolState = async pool => {
  const userCount = (await pool.getPoolUserCount()).toString()
  const currentTotalPayout = (await pool.currentTotalPayout()).toString()
  const currentTotalStakeToSlash = (await pool.currentTotalStakeToSlash()).toString()
  const currentNonCompliancePenalty = (await pool.currentNonCompliancePenalty()).toString()
  const currentStakingPeriodIndex = (await pool.currentStakingPeriodIndex()).toString()
  const updateStakingIndex = (await pool.updateStakingIndex()).toString()
  const updateStaking2Index = (await pool.updateStaking2Index()).toString()
  const complianceDataIndex = (await pool.complianceDataIndex()).toString()
  const ownerFunds = (await pool.ownerFunds()).toString()
  const totalUserStake = (await pool.totalUserStake()).toString()
  const totalAddedStakeNextPeriod = (await pool.totalAddedStakeNextPeriod()).toString()

  logger({
    userCount,
    currentTotalPayout,
    currentTotalStakeToSlash,
    currentNonCompliancePenalty,
    currentStakingPeriodIndex,
    updateStakingIndex,
    updateStaking2Index,
    complianceDataIndex,
    ownerFunds,
    totalUserStake,
    totalAddedStakeNextPeriod,
  })
}

const logIsStaking = async ({ pool, users }) => {
  const userIsStakingList = await Promise.all(
    users.map(user => pool.userIsStaking(user).then(r => r.toString()))
  )

  const userIsStakingNextPeriodList = await Promise.all(
    users.map(user =>
      pool.userIsStakingNextPeriod(user).then(r => r.toString())
    )
  )

  logger({ userIsStakingList, userIsStakingNextPeriodList })
}

const logUserBalancesForFirstPeriods = async ({ pool, users }) => {
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

  logger({
    stakesAt0,
    stakesAt1,
    stakesAt2,
    stakesAt3,
    stakesAt4,
    stakesAt5,
    stakesAt6,
  })
}

const approveAndAddUser = ({ pool, stake, token, user }) =>
  token
    .approve(pool.address, stake, { from: user })
    .then(() => pool.addUserInNextPeriod({ from: user }))

contract('JuriStakingPool', ([owner, user1, user2, user3, user4]) => {
  let juriStakingPool, token

  const defaultPeriodLength = new BN(7 * ONE_DAY)
  const defaultFeePercentage = new BN(1)
  const defaultCompliantGainPercentage = new BN(4)
  const defaultMaxNonCompliantPenaltyPercentage = new BN(5)
  const defaultMinStakePerUser = new BN(500) // ONE_TOKEN
  const defaultMaxStakePerUser = ONE_HUNDRED_TOKEN
  const defaultUpdateIterationCount = new BN(500)
  const defaultMaxTotalStake = TWO_HUNDRED_TOKEN
  const defaultJuriAddress = owner

  const deployJuriStakingPool = async ({
    periodLength = defaultPeriodLength,
    feePercentage = defaultFeePercentage,
    compliantGainPercentage = defaultCompliantGainPercentage,
    maxNonCompliantPenaltyPercentage = defaultMaxNonCompliantPenaltyPercentage,
    minStakePerUser = defaultMinStakePerUser,
    maxStakePerUser = defaultMaxStakePerUser,
    updateIterationCount = defaultUpdateIterationCount,
    maxTotalStake = defaultMaxTotalStake,
    juriAddress = defaultJuriAddress,
  } = {}) => {
    token = await ERC20Mintable.new()
    await Promise.all(
      [owner, user1, user2, user3, user4].map(user =>
        token.mint(user, TWO_HUNDRED_TOKEN)
      )
    )

    juriStakingPool = await JuriStakingPool.new(
      token.address,
      periodLength,
      feePercentage,
      compliantGainPercentage,
      maxNonCompliantPenaltyPercentage,
      minStakePerUser,
      maxStakePerUser,
      updateIterationCount,
      maxTotalStake,
      juriAddress
    )
  }

  const initialPoolSetup = async ({ pool, poolUsers, poolStakes }) => {
    await token.approve(pool.address, ONE_HUNDRED_ETHER)
    await pool.addOwnerFunds()

    await Promise.all(
      poolUsers.map((user, i) =>
        approveAndAddUser({ pool, stake: poolStakes[i], token, user })
      )
    )

    await pool.addWasCompliantDataForUsers([])
    await pool.firstUpdateStakeForNextXAmountOfUsers()
    await pool.secondUpdateStakeForNextXAmountOfUsers([])

    logger('************ After first period ************')
    await logPoolState(pool)
  }

  const runPoolRound = async ({ complianceData, pool, poolUsers }) => {
    logger('************ Balances before round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    })
    // logger('************ IsStaking before round ************')
    // await logIsStaking({ pool, users: poolUsers })

    const receipt0 = await pool.addWasCompliantDataForUsers(complianceData)
    const gasUsedComplianceData = receipt0.receipt.gasUsed
    const receipt1 = await pool.firstUpdateStakeForNextXAmountOfUsers()
    const gasUsedFirstUpdate = receipt1.receipt.gasUsed

    logger('************ State in middle of round ************')
    await logPoolState(pool)

    const receipt2 = await pool.secondUpdateStakeForNextXAmountOfUsers([])
    const gasUsedSecondUpdate = receipt2.receipt.gasUsed

    logger({
      gasUsedComplianceData,
      gasUsedFirstUpdate,
      gasUsedSecondUpdate,
    })

    // logger('************ IsStaking after round ************')
    // await logIsStaking({ pool, users: poolUsers })

    logger('************ State after round ************')
    await logPoolState(pool)

    logger('************ Balances after round ************')
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

    it('sets maxTotalStake', async () => {
      const maxTotalStake = await juriStakingPool.maxTotalStake()
      expect(maxTotalStake).to.be.bignumber.equal(defaultMaxTotalStake)
    })

    it('sets juriAddress', async () => {
      const maxTotalStake = await juriStakingPool.maxTotalStake()
      expect(maxTotalStake).to.be.bignumber.equal(defaultMaxTotalStake)
    })

    describe('when running pool rounds', async () => {
      it('updates user stakes', async () => {
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

        let totalStake = new BN(poolStakes.reduce((a, b) => a + b, 0))

        for (let j = 0; j < poolRounds; j++) {
          let stakeToSlash = new BN(0)
          let totalPayout = totalStake.sub(
            totalStake.mul(defaultFeePercentage).div(new BN(100))
          )

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
          const nonCompliantFactor = new BN(100).sub(
            new BN(nonCompliantPenaltiy)
          )

          const slashedStake = stakeToSlash
            .mul(new BN(100).sub(new BN(nonCompliantPenaltiy)))
            .div(new BN(100))
          const totalStakeUsedForPayouts = stakeToSlash.sub(slashedStake)
          const underwriterLiability = totalPayout.sub(totalStakeUsedForPayouts)
          totalStake = totalStake.add(underwriterLiability)

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

    describe('when adding users', async () => {
      it('requires a minimum stake', async () => {
        await shouldFail.reverting.withMessage(
          approveAndAddUser({
            pool: juriStakingPool,
            stake: 5,
            token,
            user: user1,
          }),
          'You need to pass the minStakePerUser to add yourself!'
        )
      })
    })

    describe('when adding more stake', async () => {
      it('adds stake to next period', async () => {
        const initialUserStake = new BN(5000)
        const addedUserStake = new BN(8000)

        await initialPoolSetup({
          pool: juriStakingPool,
          poolUsers: [user1],
          poolStakes: [initialUserStake],
        })

        await token.approve(juriStakingPool.address, addedUserStake, {
          from: user1,
        })
        await juriStakingPool.addMoreStakeForNextPeriod({ from: user1 })

        const stakeAtCurrentPeriod = await juriStakingPool.getStakeForUserInCurrentPeriod(
          { from: user1 }
        )
        const stakeAtNextPeriod = await juriStakingPool.getAdditionalStakeForUserInNextPeriod(
          {
            from: user1,
          }
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(initialUserStake)
        expect(stakeAtNextPeriod).to.be.bignumber.equal(addedUserStake)
      })

      describe('when adding more than the maximum stake per user', async () => {
        it('fails with an error describing max per user is reached', async () => {
          await initialPoolSetup({
            pool: juriStakingPool,
            poolUsers: [user1],
            poolStakes: [5000],
          })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user1,
          })

          await shouldFail.reverting.withMessage(
            juriStakingPool.addMoreStakeForNextPeriod({ from: user1 }),
            'Cannot add more funds for user, because the max per user is reached!'
          )
        })
      })

      describe('when adding above the maximum total stake in pool', async () => {
        it('fails with an error describing max in pool is reached', async () => {
          await initialPoolSetup({
            pool: juriStakingPool,
            poolUsers: [user1],
            poolStakes: [5000],
          })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user2,
          })
          await juriStakingPool.addMoreStakeForNextPeriod({ from: user2 })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user3,
          })

          await shouldFail.reverting.withMessage(
            juriStakingPool.addMoreStakeForNextPeriod({ from: user3 }),
            'Cannot add more funds to pool, because the max in pool is reached!'
          )
        })
      })
    })

    // TODO
    describe('when switching to next staking period', async () => {})
    describe('when ...', async () => {})
    describe('when ...', async () => {})
    describe('when ...', async () => {})
  })
})
