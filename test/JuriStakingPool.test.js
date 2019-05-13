const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultMinStakePerUser,
  defaultMaxStakePerUser,
  defaultMaxTotalStake,
  defaultUpdateIterationCount,
  ONE_HUNDRED_TOKEN,
  setDefaultJuriAddress,
} = require('./defaults')

const {
  deployJuriStakingPool,
  initialPoolSetup,
  logComplianceDataForFirstPeriods,
  logFirstUsers,
  logger,
  // logIsStaking,
  logPoolState,
  logUserBalancesForFirstPeriods,
} = require('./helpers')

const itAddsNewUsersCorrectly = require('./addUserInNextPeriod.test')
const itRemovesNewUsersCorrectly = require('./removeUserInNextPeriod.test')
const itAddsComplianceDataCorrectly = require('./addComplianceData.test')
const itRunsFirstUpdateCorrectly = require('./firstUpdateStakeForNextXAmountOfUsers.test')
const itRunsSecondUpdateCorrectly = require('./secondUpdateStakeForNextXAmountOfUsers.test')

contract('JuriStakingPool', accounts => {
  let juriStakingPool

  const [owner, user1, user2, user3, user4, user5, user6] = accounts

  beforeEach(() => setDefaultJuriAddress(owner))

  const runPoolRound = async ({ complianceData, pool, poolUsers }) => {
    /* logger('************ Balances before round ************')
    await logUserBalancesForFirstPeriods({
      pool,
      users: poolUsers,
    }) */
    // logger('************ IsStaking before round ************')
    // await logIsStaking({ pool, users: poolUsers })

    await time.increase(defaultPeriodLength)
    const receipt0 = await pool.addWasCompliantDataForUsers(
      defaultUpdateIterationCount,
      complianceData
    )

    await logFirstUsers({ pool, userCount: poolUsers.length })

    await logComplianceDataForFirstPeriods({
      pool,
      users: poolUsers,
    })

    const gasUsedComplianceData = receipt0.receipt.gasUsed
    const receipt1 = await pool.firstUpdateStakeForNextXAmountOfUsers(
      defaultUpdateIterationCount
    )
    const gasUsedFirstUpdate = receipt1.receipt.gasUsed

    logger('************ State in middle of round ************', {
      logLevel: 1,
    })
    await logPoolState(pool)

    const receipt2 = await pool.secondUpdateStakeForNextXAmountOfUsers(
      defaultUpdateIterationCount
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
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [owner, user1, user2, user3, user4],
      })

      juriStakingPool = deployedContracts.pool
      token = deployedContracts.token
    })

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

    describe('when adding new users', async () => {
      if (process.env.FULL_TESTING === 'true') {
        describe('when there is only one user', async () => {
          const addresses = [owner, user1]
          const addressesToAdd = [user2, user3, user4]

          itAddsNewUsersCorrectly({ addresses, addressesToAdd })
        })

        describe('when there are many users', async () => {
          const addresses = accounts.slice(0, accounts.length - 3)
          const addressesToAdd = accounts.slice(accounts.length - 3)

          itAddsNewUsersCorrectly({ addresses, addressesToAdd })
        })
      } else {
        describe('when there are only a few users', async () => {
          const addresses = [owner, user1, user2, user3]
          const addressesToAdd = [user4, user5, user6]

          itAddsNewUsersCorrectly({ addresses, addressesToAdd })
        })
      }
    })

    describe('when removing users', async () => {
      if (process.env.FULL_TESTING === 'true') {
        describe('when there is only one user', async () => {
          const addresses = [owner, user1]

          itRemovesNewUsersCorrectly(addresses)
        })

        describe('when there are many users', async () => {
          const addresses = accounts

          itRemovesNewUsersCorrectly(addresses)
        })
      } else {
        describe('when there are only a few users', async () => {
          const addresses = [owner, user1, user2, user3]
          itRemovesNewUsersCorrectly(addresses)
        })
      }
    })

    describe('when adding compliance data', async () => {
      if (process.env.FULL_TESTING === 'true') {
        describe('when there is only one user', async () => {
          const addresses = [owner, user1]

          itAddsComplianceDataCorrectly(addresses)
        })

        describe('when there are many users', async () => {
          const addresses = accounts // all available addresses

          itAddsComplianceDataCorrectly(addresses)
        })
      } else {
        describe('when there are only a few users', async () => {
          const addresses = [owner, user1, user2, user3]
          itAddsComplianceDataCorrectly(addresses)
        })
      }
    })

    describe('when running the first update', async () => {
      if (process.env.FULL_TESTING === 'true') {
        describe('when there is only one user', async () => {
          const addresses = [owner, user1]

          itRunsFirstUpdateCorrectly(addresses)
        })

        describe('when there are many users', async () => {
          const addresses = accounts // all available addresses

          itRunsFirstUpdateCorrectly(addresses)
        })
      } else {
        describe('when there are only a few users', async () => {
          const addresses = [owner, user1, user2, user3]

          itRunsFirstUpdateCorrectly(addresses)
        })
      }
    })

    describe('when running the second update', async () => {
      if (process.env.FULL_TESTING === 'true') {
        describe('when there is only one user', async () => {
          const addresses = [owner, user1]

          itRunsSecondUpdateCorrectly(addresses)
        })

        describe('when there are many users', async () => {
          const addresses = accounts // all available addresses

          itRunsSecondUpdateCorrectly(addresses)
        })
      } else {
        describe('when there are only a few users', async () => {
          const addresses = [owner, user1, user2, user3]

          itRunsSecondUpdateCorrectly(addresses)
        })
      }
    })

    describe('when running pool rounds', async () => {
      it('updates user stakes', async () => {
        const poolUsers = [user1, user2, user3, user4]
        const poolStakes = [1000, 1000, 1000, 1000]

        await initialPoolSetup({
          pool: juriStakingPool,
          poolUsers,
          poolStakes,
          token,
        })

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

    describe('when adding more stake', async () => {
      it('adds stake to next period', async () => {
        const initialUserStake = new BN(5000)
        const addedUserStake = new BN(8000)

        await initialPoolSetup({
          pool: juriStakingPool,
          poolUsers: [user1],
          poolStakes: [initialUserStake],
          token,
        })

        await token.approve(juriStakingPool.address, addedUserStake, {
          from: user1,
        })
        await juriStakingPool.addMoreStakeForNextPeriod(addedUserStake, {
          from: user1,
        })

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
            token,
          })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user1,
          })

          await shouldFail.reverting.withMessage(
            juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
              from: user1,
            }),
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
            token,
          })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user2,
          })
          await juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
            from: user2,
          })

          await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
            from: user3,
          })

          await shouldFail.reverting.withMessage(
            juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
              from: user3,
            }),
            'Cannot add more funds to pool, because the max in pool is reached!'
          )
        })
      })
    })
  })
})
