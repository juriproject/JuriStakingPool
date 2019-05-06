const assert = require('assert')
const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultCompliantGainPercentage,
  defaultFeePercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultPeriodLength,
  defaultUpdateIterationCount,
} = require('./defaults')

const {
  deployJuriStakingPool,
  initialPoolSetup,
  runFullComplianceDataAddition,
  runFullFirstUpdate,
  runFullSecondUpdate,
  runFullCompleteRound,
  Stages,
} = require('./helpers')

const {
  computeJuriFees,
  computeNewCompliantStake,
  computeNewNonCompliantStake,
} = require('./computationHelpers')

const itRunsSecondUpdateCorrectly = async addresses => {
  describe('when running second update', async () => {
    let complianceData,
      juriStakingPool,
      pool,
      poolUsers,
      poolStakes,
      token,
      totalPayout,
      totalStakeToSlash

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      juriStakingPool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length)
        .fill(false)
        .fill(true, poolUsers.length / 2)

      await initialPoolSetup({
        pool: juriStakingPool,
        poolUsers,
        poolStakes,
        token,
      })
      await time.increase(defaultPeriodLength)

      await juriStakingPool.addWasCompliantDataForUsers(
        defaultUpdateIterationCount,
        complianceData
      )

      await runFullFirstUpdate({
        pool: juriStakingPool,
        poolUsers,
        updateIterationCount: defaultUpdateIterationCount,
      })

      totalStakeToSlash = poolStakes.reduce(
        (stakeToSlash, userStake) => stakeToSlash.add(userStake),
        new BN(0)
      )
      const juriFees = computeJuriFees({
        feePercentage: defaultFeePercentage,
        totalUserStake: totalStakeToSlash,
      })
      totalPayout = juriFees

      pool = juriStakingPool
    })

    describe('when called by owner', async () => {
      it('does not revert the transaction', async () => {
        try {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            []
          )
        } catch (error) {
          assert.fail(
            'The transaction from the owner should not have been reverted!'
          )
        }
      })
    })

    describe('when called by owner', async () => {
      it('does not revert the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            [0]
          ),
          'Please pass _removalIndices by calling `getRemovalIndicesInUserList`!'
        )
      })
    })

    describe('when not called by owner', async () => {
      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            [],
            {
              from: poolUsers[0],
            }
          ),
          'Only owner can use this function!'
        )
      })
    })

    describe('when called in stage AWAITING_COMPLIANCE_DATA', async () => {
      beforeEach(async () => {
        await pool.secondUpdateStakeForNextXAmountOfUsers(
          defaultUpdateIterationCount,
          []
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            []
          ),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when called in stage AWAITING_FIRST_UPDATE', async () => {
      beforeEach(async () => {
        await runFullSecondUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
        await time.increase(defaultPeriodLength)
        await pool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          complianceData
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            []
          ),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when computing useMaxNonCompliantFactor', async () => {
      beforeEach(async () => {
        await runFullSecondUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
        await time.increase(defaultPeriodLength)

        complianceData = new Array(poolUsers.length).fill(false)

        await juriStakingPool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          complianceData
        )

        await runFullFirstUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
      })

      it.only('computes it correctly', async () => {
        if (poolUsers.length > 1) {
          await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1), [])
          const { useMaxNonCompliancy } = await pool.currentStakingRound()

          expect(useMaxNonCompliancy).to.be.false
        }
      })
    })

    describe('when given different updateIterationCounts', async () => {
      beforeEach(async () => {
        const deployedContracts = await deployJuriStakingPool({ addresses })

        juriStakingPool = deployedContracts.pool
        token = deployedContracts.token

        poolUsers = addresses.slice(1, addresses.length) // without owner
        poolStakes = new Array(poolUsers.length).fill(new BN(1000))

        await initialPoolSetup({
          pool: juriStakingPool,
          poolUsers,
          poolStakes,
          token,
        })
        await time.increase(defaultPeriodLength)

        pool = juriStakingPool
      })

      const itRunsSecondUpdateCorrectlyWithIterationCount = async updateIterationCount => {
        describe('when users are not staking', async () => {
          beforeEach(async () => {
            for (let i = 0; i < poolUsers.length; i++) {
              await pool.optOutOfStakingForNextPeriod({ from: poolUsers[i] })
            }

            complianceData = new Array(poolUsers.length)
              .fill(false)
              .fill(true, poolUsers.length / 2)

            await runFullCompleteRound({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })
            await time.increase(defaultPeriodLength)

            await runFullComplianceDataAddition({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })

            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })
          })

          it('moves the user stakes without changing while adding new stakes', async () => {
            const currentStakesBefore = []
            const nextStakesBefore = []

            for (let i = 0; i < poolUsers.length; i++) {
              currentStakesBefore.push(
                await pool.getStakeForUserInCurrentPeriod({
                  from: poolUsers[i],
                })
              )
              nextStakesBefore.push(
                await pool.getAdditionalStakeForUserInNextPeriod({
                  from: poolUsers[i],
                })
              )
            }

            await runFullSecondUpdate({
              pool,
              poolUsers,
              updateIterationCount,
            })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: poolUsers[i] }
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: poolUsers[i] }
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                new BN(currentStakesBefore[i]).add(nextStakesBefore[i])
              )
              expect(nextStakeAfter).to.be.bignumber.equal(new BN(0))
            }
          })
        })

        describe('when users are non-compliant', async () => {
          beforeEach(async () => {
            complianceData = new Array(poolUsers.length).fill(false)
            addedUserStakes = new Array(poolUsers.length).fill(new BN(500))

            for (let i = 0; i < poolUsers.length; i++) {
              await token.approve(pool.address, addedUserStakes[i], {
                from: poolUsers[i],
              })

              await pool.addMoreStakeForNextPeriod({ from: poolUsers[i] })
            }

            await runFullComplianceDataAddition({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            totalStakeToSlash = poolStakes.reduce(
              (stakeToSlash, userStake) => stakeToSlash.add(userStake),
              new BN(0)
            )
            const juriFees = computeJuriFees({
              feePercentage: defaultFeePercentage,
              totalUserStake: totalStakeToSlash,
            })
            totalPayout = juriFees
          })

          it('moves its users stake', async () => {
            const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
              { from: poolUsers[0] }
            )
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              { from: poolUsers[0] }
            )

            expect(currentStakeAfter).to.be.bignumber.above(currentStakeBefore)
          })

          it('adds stake from next period', async () => {
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: poolUsers[i] }
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: poolUsers[i] }
              )

              expect(nextStakeAfter).to.be.bignumber.equal(new BN(0))
              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewNonCompliantStake({
                  maxNonCompliantPenaltyPercentage: defaultMaxNonCompliantPenaltyPercentage,
                  totalPayout,
                  totalStakeToSlash,
                  userStake: poolStakes[i],
                }).add(addedUserStakes[i])
              )
            }
          })

          it('updates the total user stakes accordingly', async () => {
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            const totalUserStake = await pool.totalUserStake()

            const expectedTotalUserStake = poolStakes.reduce(
              (sum, userStake, i) => {
                const newUserStake = computeNewNonCompliantStake({
                  maxNonCompliantPenaltyPercentage: defaultMaxNonCompliantPenaltyPercentage,
                  totalPayout,
                  totalStakeToSlash,
                  userStake,
                }).add(addedUserStakes[i])
                return sum.add(newUserStake)
              },
              new BN(0)
            )

            expect(totalUserStake).to.be.bignumber.equal(expectedTotalUserStake)
          })

          it('subtracts the non-compliant factor from the user stakes', async () => {
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: poolUsers[i] }
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewNonCompliantStake({
                  maxNonCompliantPenaltyPercentage: defaultMaxNonCompliantPenaltyPercentage,
                  totalPayout,
                  totalStakeToSlash,
                  userStake: poolStakes[i],
                }).add(addedUserStakes[i])
              )
            }
          })

          it('adds updateIterationCount to updateStaking2Index', async () => {
            await pool.secondUpdateStakeForNextXAmountOfUsers(
              updateIterationCount,
              []
            )
            const { updateStaking2Index } = await pool.currentStakingRound()

            updateIterationCount.gte(new BN(poolUsers.length))
              ? expect(updateStaking2Index).to.be.bignumber.equal(new BN(0))
              : expect(updateStaking2Index).to.be.bignumber.equal(
                  updateIterationCount
                )
          })

          it('updates the stage to AWAITING_COMPLIANCE_DATA', async () => {
            for (
              let i = new BN(0);
              i.lt(new BN(poolUsers.length));
              i = i.add(updateIterationCount)
            ) {
              const stageBefore = (await pool.currentStakingRound()).stage
              expect(stageBefore).to.be.bignumber.equal(
                Stages.AWAITING_SECOND_UPDATE
              )

              await pool.secondUpdateStakeForNextXAmountOfUsers(
                updateIterationCount,
                []
              )
            }

            const stageAfter = (await pool.currentStakingRound()).stage
            expect(stageAfter).to.be.bignumber.equal(
              Stages.AWAITING_COMPLIANCE_DATA
            )
          })
        })

        describe('when users are compliant', async () => {
          beforeEach(async () => {
            complianceData = new Array(poolUsers.length).fill(true)
            await runFullComplianceDataAddition({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })
          })
        })
      }

      describe('when using a small updateIterationCount', async () => {
        const updateIterationCount = new BN(1)

        itRunsSecondUpdateCorrectlyWithIterationCount(updateIterationCount)
      })

      describe('when using a high updateIterationCount', async () => {
        const updateIterationCount = new BN(1000)

        itRunsSecondUpdateCorrectlyWithIterationCount(updateIterationCount)
      })
    })

    describe('when given different max non-compliant factors', async () => {
      let maxNonCompliantPenaltyPercentage

      describe('when given a low max non-compliant factor percentage', async () => {
        beforeEach(async () => {
          maxNonCompliantPenaltyPercentage = new BN(1)

          const deployedContracts = await deployJuriStakingPool({
            addresses,
            maxNonCompliantPenaltyPercentage,
          })

          juriStakingPool = deployedContracts.pool
          token = deployedContracts.token

          poolUsers = addresses.slice(1, addresses.length) // without owner
          poolStakes = new Array(poolUsers.length).fill(new BN(1000))

          await initialPoolSetup({
            pool: juriStakingPool,
            poolUsers,
            poolStakes,
            token,
          })
          await time.increase(defaultPeriodLength)

          pool = juriStakingPool
          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 2)
          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )

          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })

          totalStakeToSlash = poolStakes.reduce(
            (stakeToSlash, userStake, i) =>
              i < poolUsers.length / 2 - 1
                ? stakeToSlash.add(userStake)
                : stakeToSlash,
            new BN(0)
          )
          const totalUserStake = poolStakes.reduce(
            (stakeToSlash, userStake) => stakeToSlash.add(userStake),
            new BN(0)
          )
          const juriFees = computeJuriFees({
            feePercentage: defaultFeePercentage,
            totalUserStake,
          })

          totalPayout = poolStakes.reduce(
            (totalPayout, userStake, i) =>
              i > poolUsers.length / 2 - 1
                ? totalPayout.add(
                    computeNewCompliantStake({
                      compliantGainPercentage: defaultCompliantGainPercentage,
                      userStake,
                    }).sub(userStake)
                  )
                : totalPayout,
            juriFees
          )
        })

        it('computes the new stakes correctly', async () => {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            []
          )

          for (let i = 0; i < poolUsers.length / 2 - 1; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              { from: poolUsers[i] }
            )

            expect(currentStakeAfter).to.be.bignumber.equal(
              computeNewNonCompliantStake({
                maxNonCompliantPenaltyPercentage,
                totalPayout,
                totalStakeToSlash,
                userStake: poolStakes[i],
              })
            )
          }
        })
      })

      describe('when given a high max non-compliant factor percentage', async () => {
        beforeEach(async () => {
          maxNonCompliantPenaltyPercentage = new BN(90)

          const deployedContracts = await deployJuriStakingPool({
            addresses,
            maxNonCompliantPenaltyPercentage,
          })

          juriStakingPool = deployedContracts.pool
          token = deployedContracts.token

          poolUsers = addresses.slice(1, addresses.length) // without owner
          poolStakes = new Array(poolUsers.length).fill(new BN(1000))

          await initialPoolSetup({
            pool: juriStakingPool,
            poolUsers,
            poolStakes,
            token,
          })
          await time.increase(defaultPeriodLength)

          pool = juriStakingPool
          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 2)
          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )

          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })

          totalStakeToSlash = poolStakes.reduce(
            (stakeToSlash, userStake, i) =>
              i < poolUsers.length / 2 - 1
                ? stakeToSlash.add(userStake)
                : stakeToSlash,
            new BN(0)
          )
          const totalUserStake = poolStakes.reduce(
            (stakeToSlash, userStake) => stakeToSlash.add(userStake),
            new BN(0)
          )
          const juriFees = computeJuriFees({
            feePercentage: defaultFeePercentage,
            totalUserStake,
          })

          totalPayout = poolStakes.reduce(
            (totalPayout, userStake, i) =>
              i > poolUsers.length / 2 - 1
                ? totalPayout.add(
                    computeNewCompliantStake({
                      compliantGainPercentage: defaultCompliantGainPercentage,
                      userStake,
                    }).sub(userStake)
                  )
                : totalPayout,
            juriFees
          )
        })

        it('computes the new stakes correctly', async () => {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            []
          )

          for (let i = 0; i < poolUsers.length / 2 - 1; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              { from: poolUsers[i] }
            )

            expect(currentStakeAfter).to.be.bignumber.equal(
              computeNewNonCompliantStake({
                maxNonCompliantPenaltyPercentage,
                totalPayout,
                totalStakeToSlash,
                userStake: poolStakes[i],
              })
            )
          }
        })
      })
    })
  })
}

module.exports = itRunsSecondUpdateCorrectly
