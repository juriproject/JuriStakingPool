const { expect } = require('chai')
const { BN, ether, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  approveAndAddUser,
  asyncForEach,
  expectUserCountToBe,
  logComplianceDataForFirstPeriods,
  logFirstUsers,
  logger,
  // logIsStaking,
  logPoolState,
  logUserBalancesForFirstPeriods,
} = require('./helpers')

const JuriStakingPool = artifacts.require('./JuriStakingPool.sol')
const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')

const UPDATE_ITERATION_COUNT = new BN(500)
const ONE_HUNDRED_ETHER = ether('100')
// const ONE_TOKEN = ether('1')
const ONE_HUNDRED_TOKEN = ether('100')
const TWO_HUNDRED_TOKEN = ether('200')

contract('JuriStakingPool', ([owner, user1, user2, user3, user4]) => {
  let juriStakingPool, token

  const defaultPeriodLength = time.duration.days(7)
  const defaultFeePercentage = new BN(1)
  const defaultCompliantGainPercentage = new BN(4)
  const defaultMaxNonCompliantPenaltyPercentage = new BN(5)
  const defaultMinStakePerUser = new BN(500) // ONE_TOKEN
  const defaultMaxStakePerUser = ONE_HUNDRED_TOKEN
  const defaultMaxTotalStake = TWO_HUNDRED_TOKEN
  const defaultJuriAddress = owner

  const deployJuriStakingPool = async ({
    periodLength = defaultPeriodLength,
    feePercentage = defaultFeePercentage,
    compliantGainPercentage = defaultCompliantGainPercentage,
    maxNonCompliantPenaltyPercentage = defaultMaxNonCompliantPenaltyPercentage,
    minStakePerUser = defaultMinStakePerUser,
    maxStakePerUser = defaultMaxStakePerUser,
    maxTotalStake = defaultMaxTotalStake,
    juriAddress = defaultJuriAddress,
  } = {}) => {
    token = await ERC20Mintable.new()
    await Promise.all(
      [owner, user1, user2, user3, user4].map(user =>
        token.mint(user, TWO_HUNDRED_TOKEN)
      )
    )

    const startTime = (await time.latest()).add(time.duration.seconds(20))

    juriStakingPool = await JuriStakingPool.new(
      token.address,
      startTime,
      periodLength,
      feePercentage,
      compliantGainPercentage,
      maxNonCompliantPenaltyPercentage,
      minStakePerUser,
      maxStakePerUser,
      maxTotalStake,
      juriAddress
    )
  }

  const initialPoolSetup = async ({ pool, poolUsers, poolStakes }) => {
    await token.approve(pool.address, ONE_HUNDRED_ETHER)
    await pool.addOwnerFunds()

    await asyncForEach({
      array: poolUsers,
      callback: async (user, i) =>
        approveAndAddUser({
          pool,
          stake: poolStakes[i],
          token,
          user,
        }),
    })

    await time.increase(defaultPeriodLength)

    await pool.addWasCompliantDataForUsers(UPDATE_ITERATION_COUNT, [])
    await pool.firstUpdateStakeForNextXAmountOfUsers(UPDATE_ITERATION_COUNT)
    await pool.secondUpdateStakeForNextXAmountOfUsers(
      UPDATE_ITERATION_COUNT,
      []
    )

    logger('************ After first period ************')
    await logPoolState(pool)
  }

  const runPoolRound = async ({ complianceData, pool, poolUsers }) => {
    /* logger('************ Balances before round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    }) */
    // logger('************ IsStaking before round ************')
    // await logIsStaking({ pool, users: poolUsers })

    const removalIndices = await juriStakingPool.getRemovalIndicesInUserList()

    await time.increase(defaultPeriodLength)
    const receipt0 = await pool.addWasCompliantDataForUsers(
      UPDATE_ITERATION_COUNT,
      complianceData
    )

    await logFirstUsers({ pool, userCount: poolUsers.length })

    await logComplianceDataForFirstPeriods({
      pool,
      users: poolUsers,
    })

    const gasUsedComplianceData = receipt0.receipt.gasUsed
    const receipt1 = await pool.firstUpdateStakeForNextXAmountOfUsers(
      UPDATE_ITERATION_COUNT
    )
    const gasUsedFirstUpdate = receipt1.receipt.gasUsed

    logger('************ State in middle of round ************', {
      logLevel: 1,
    })
    await logPoolState(pool)

    const receipt2 = await pool.secondUpdateStakeForNextXAmountOfUsers(
      UPDATE_ITERATION_COUNT,
      removalIndices
    )
    const gasUsedSecondUpdate = receipt2.receipt.gasUsed

    logger({
      gasUsedComplianceData,
      gasUsedFirstUpdate,
      gasUsedSecondUpdate,
    })

    // logger('************ IsStaking after round ************')
    // await logIsStaking({ pool, users: poolUsers })

    logger('************ State after round ************', { logLevel: 1 })
    await logPoolState(pool)

    logger('************ Balances after round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    })
  }

  describe('when staking', async () => {
    beforeEach(async () => await deployJuriStakingPool())

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

        for (let j = 0; j < poolRounds; j++) {
          const totalStake = expectedUserBalances.reduce(
            (a, b) => a.add(b),
            new BN(0)
          )

          let stakeToSlash = new BN(0)
          let totalPayout = totalStake
            .mul(defaultFeePercentage)
            .div(new BN(100))

          poolUsers.forEach((_, i) => {
            if (complianceData[j][i]) {
              const newStake = expectedUserBalances[i]
                .mul(compliantFactor)
                .div(new BN(100))
              const gain = newStake.sub(expectedUserBalances[i])
              totalPayout = totalPayout.add(gain)
            } else {
              stakeToSlash = stakeToSlash.add(expectedUserBalances[i])
            }
          })

          const useMaxNonCompliancy =
            stakeToSlash.eq(new BN(0)) ||
            totalPayout.mul(new BN(100)).div(stakeToSlash) >
              defaultMaxNonCompliantPenaltyPercentage

          const juriFeesForRound = totalStake
            .mul(defaultFeePercentage)
            .div(new BN(100))

          poolUsers.forEach((_, i) => {
            const oldBalance = expectedUserBalances[i]

            if (useMaxNonCompliancy) {
              const nonCompliantFactor = new BN(100).sub(
                new BN(defaultMaxNonCompliantPenaltyPercentage)
              )
              expectedUserBalances[i] = oldBalance
                .mul(
                  complianceData[j][i] ? compliantFactor : nonCompliantFactor
                )
                .div(new BN(100))
            } else {
              expectedUserBalances[i] = oldBalance
                .mul(stakeToSlash.sub(totalPayout))
                .div(stakeToSlash)
            }

            logger(
              {
                PoolRound: j,
                User: i,
                ExpectedBalance: expectedUserBalances[i].toNumber(),
              },
              { logLevel: 0 }
            )

            const totalStakeAfter = expectedUserBalances.reduce(
              (a, b) => a.add(b),
              new BN(0)
            )

            logger(
              {
                stakeToSlash: stakeToSlash.toString(),
                totalPayout: totalPayout.toString(),
                useMaxNonCompliancy,
                maxNonCompliantFactor: defaultMaxNonCompliantPenaltyPercentage.toString(),
                juriFeesForRound: juriFeesForRound.toString(),
                totalStake: totalStakeAfter.toString(),
              },
              { logLevel: 1 }
            )
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

    describe('when removing users', async () => {
      it('removes them after a round', async () => {
        let poolUsers = [user1, user2, user3, user4]
        const poolStakes = [1000, 1000, 1000, 1000]

        await initialPoolSetup({ pool: juriStakingPool, poolUsers, poolStakes })

        const complianceData = [
          [false, false, true, true],
          [true, true],
          [false, false],
          [true],
        ]
        const poolRounds = 4

        for (let i = 0; i < poolRounds; i++) {
          switch (i) {
            case 0:
              await juriStakingPool.removeUserInNextPeriod({ from: user1 })
              await juriStakingPool.removeUserInNextPeriod({ from: user2 })
              break

            case 1:
              poolUsers = [user3, user4]
              break

            case 2:
              await juriStakingPool.removeUserInNextPeriod({ from: user3 })
              break

            case 3:
              poolUsers = [user4]
              await juriStakingPool.removeUserInNextPeriod({ from: user4 })
              break

            default:
              break
          }

          await expectUserCountToBe({
            pool: juriStakingPool,
            expectedUserCount: poolUsers.length,
          })

          await runPoolRound({
            complianceData: complianceData[i],
            pool: juriStakingPool,
            poolUsers,
          })
        }

        await expectUserCountToBe({
          pool: juriStakingPool,
          expectedUserCount: 0,
        })
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
