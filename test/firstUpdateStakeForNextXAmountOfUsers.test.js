const assert = require('assert')
const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultCompliantGainPercentage,
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

const { computeNewCompliantStake } = require('./computationHelpers')

const itRunsFirstUpdateCorrectly = async addresses => {
  describe('when running the first update', async () => {
    let complianceData, pool, poolUsers, poolStakes, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length)
        .fill(false)
        .fill(true, poolUsers.length / 2)

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
      await time.increase(defaultPeriodLength)

      await runFullComplianceDataAddition({
        complianceData,
        pool,
        poolUsers,
        updateIterationCount: defaultUpdateIterationCount,
      })
    })

    describe('when called by owner', async () => {
      it('does not revert the transaction', async () => {
        try {
          await pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          )
        } catch (error) {
          assert.fail(
            'The transaction from the owner should not have been reverted!'
          )
        }
      })
    })

    describe('when not called by owner', async () => {
      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
            {
              from: poolUsers[0],
            }
          ),
          'Only owner can use this function!'
        )
      })
    })

    describe('when called in stage AWAITING_SECOND_UPDATE', async () => {
      beforeEach(async () => {
        await runFullFirstUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          ),
          'Function cannot be called at this time!'
        )
      })
    })

    describe('when called in stage AWAITING_COMPLIANCE_DATA', async () => {
      beforeEach(async () => {
        await runFullFirstUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
        await runFullSecondUpdate({
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
      })

      it.only('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          ),
          'Function cannot be called at this time!'
        )
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

      const itRunsFirstUpdateCorrectlyWithIterationCount = async updateIterationCount => {
        describe('when users are not staking', async () => {
          beforeEach(async () => {
            for (let i = 0; i < poolUsers.length; i++) {
              await pool.optOutOfStakingForNextPeriod({ from: poolUsers[i] })
            }

            complianceData = new Array(poolUsers.length)
              .fill(false)
              .fill(true, poolUsers.length / 2)
          })

          it('does not update or move the user stakes', async () => {
            for (let i = 0; i < poolUsers.length; i++) {
              const userIsStakingBefore = await pool.getIsCurrentRoundStaking({
                from: poolUsers[i],
              })
              expect(userIsStakingBefore).to.be.true
            }

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

            const currentStakesBefore = []
            const nextStakesBefore = []

            for (let i = 0; i < poolUsers.length; i++) {
              currentStakesBefore.push(
                await pool.getStakeForUserInCurrentPeriod(poolUsers[i])
              )
              nextStakesBefore.push(
                await pool.getAdditionalStakeForUserInNextPeriod(poolUsers[i])
              )

              const userIsStakingAfter = await pool.getIsCurrentRoundStaking({
                from: poolUsers[i],
              })
              expect(userIsStakingAfter).to.be.false
            }

            await runFullFirstUpdate({
              pool,
              poolUsers,
              updateIterationCount,
            })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                poolUsers[i]
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                poolUsers[i]
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                new BN(currentStakesBefore[i])
              )
              expect(nextStakeAfter).to.be.bignumber.equal(nextStakesBefore[i])
            }
          })
        })

        describe('when users are compliant', async () => {
          beforeEach(async () => {
            complianceData = new Array(poolUsers.length).fill(true)
            addedUserStakes = new Array(poolUsers.length).fill(new BN(500))

            for (let i = 0; i < poolUsers.length; i++) {
              await token.approve(pool.address, addedUserStakes[i], {
                from: poolUsers[i],
              })

              await pool.addMoreStakeForNextPeriod(addedUserStakes[i], {
                from: poolUsers[i],
              })
            }

            await runFullComplianceDataAddition({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })
          })

          it('moves the user stakes', async () => {
            const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )

            expect(currentStakeAfter).to.be.bignumber.above(currentStakeBefore)
          })

          it('adds stakes from next period', async () => {
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                poolUsers[i]
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                poolUsers[i]
              )

              expect(nextStakeAfter).to.be.bignumber.equal(new BN(0))
              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake: poolStakes[i],
                }).add(addedUserStakes[i])
              )
            }
          })

          it('updates the total user stakes accordingly', async () => {
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const totalUserStake = await pool.totalUserStake()

            const expectedTotalUserStake = poolStakes.reduce(
              (sum, userStake, i) => {
                const newUserStake = computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake,
                }).add(addedUserStakes[i])
                return sum.add(newUserStake)
              },
              new BN(0)
            )

            expect(totalUserStake).to.be.bignumber.equal(expectedTotalUserStake)
          })

          it('does not change the totalStakeToSlash for the current round', async () => {
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const { totalStakeToSlash } = await pool.currentStakingRound()
            expect(totalStakeToSlash).to.be.bignumber.equal(new BN(0))
          })

          it('adds the compliant factor to the user stakes', async () => {
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                poolUsers[i]
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake: poolStakes[i],
                }).add(addedUserStakes[i])
              )
            }
          })

          it('adds gain for users to the total payout for current round', async () => {
            const totalPayoutBefore = (await pool.currentStakingRound())
              .totalPayout

            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const totalPayoutAfter = (await pool.currentStakingRound())
              .totalPayout

            const expectedTotalPayout = poolStakes.reduce(
              (totalPayout, userStake) =>
                totalPayout.add(
                  computeNewCompliantStake({
                    compliantGainPercentage: defaultCompliantGainPercentage,
                    userStake,
                  }).sub(userStake)
                ),
              totalPayoutBefore
            )

            expect(totalPayoutAfter).to.be.bignumber.equal(expectedTotalPayout)
          })

          it('adds updateIterationCount to updateStaking1Index', async () => {
            await pool.firstUpdateStakeForNextXAmountOfUsers(
              updateIterationCount
            )
            const { updateStaking1Index } = await pool.currentStakingRound()
            expect(updateStaking1Index).to.be.bignumber.equal(
              updateIterationCount
            )
          })

          it('updates the stage to AWAITING_SECOND_UPDATE', async () => {
            for (
              let i = new BN(0);
              i.lt(new BN(poolUsers.length));
              i = i.add(updateIterationCount)
            ) {
              const stageBefore = (await pool.currentStakingRound()).stage
              expect(stageBefore).to.be.bignumber.equal(
                Stages.AWAITING_FIRST_UPDATE
              )

              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
            }

            const stageAfter = (await pool.currentStakingRound()).stage
            expect(stageAfter).to.be.bignumber.equal(
              Stages.AWAITING_SECOND_UPDATE
            )
          })
        })

        describe('when users are non-compliant', async () => {
          beforeEach(async () => {
            complianceData = new Array(poolUsers.length).fill(false)
            await runFullComplianceDataAddition({
              complianceData,
              pool,
              poolUsers,
              updateIterationCount,
            })
          })

          it('changes the totalStakeToSlash for the current round', async () => {
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const { totalStakeToSlash } = await pool.currentStakingRound()

            const expectedTotalStakeToSlash = poolStakes.reduce(
              (stakeToSlash, userStake) => stakeToSlash.add(userStake),
              new BN(0)
            )
            expect(totalStakeToSlash).to.be.bignumber.equal(
              expectedTotalStakeToSlash
            )
          })

          it('does not update or move the user stakes', async () => {
            const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )
            const nextStakeBefore = await pool.getAdditionalStakeForUserInNextPeriod(
              poolUsers[0]
            )

            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )
            const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
              poolUsers[0]
            )

            expect(currentStakeAfter).to.be.bignumber.equal(
              new BN(currentStakeBefore)
            )
            expect(nextStakeAfter).to.be.bignumber.equal(nextStakeBefore)
          })
        })
      }

      describe('when using a small updateIterationCount', async () => {
        const updateIterationCount = new BN(1)

        itRunsFirstUpdateCorrectlyWithIterationCount(updateIterationCount)
      })

      describe('when using a high updateIterationCount', async () => {
        const updateIterationCount = new BN(1000)

        itRunsFirstUpdateCorrectlyWithIterationCount(updateIterationCount)
      })
    })

    describe('when given different compliance gain percentages', async () => {
      let compliantGainPercentage

      describe('when given a low compliance gain percentage', async () => {
        beforeEach(async () => {
          compliantGainPercentage = new BN(1)

          const deployedContracts = await deployJuriStakingPool({
            addresses,
            compliantGainPercentage,
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
          complianceData = new Array(poolUsers.length).fill(true)
          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
        })

        it('computes the new stakes correctly', async () => {
          await pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          )

          for (let i = 0; i < poolUsers.length; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[i]
            )

            expect(currentStakeAfter).to.be.bignumber.equal(
              computeNewCompliantStake({
                compliantGainPercentage,
                userStake: poolStakes[i],
              })
            )
          }
        })
      })

      describe('when given a high compliance gain percentage', async () => {
        beforeEach(async () => {
          compliantGainPercentage = new BN(90)

          const deployedContracts = await deployJuriStakingPool({
            addresses,
            compliantGainPercentage,
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
          complianceData = new Array(poolUsers.length).fill(true)
          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
        })

        it('computes the new stakes correctly', async () => {
          await pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          )

          for (let i = 0; i < poolUsers.length; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[i]
            )

            expect(currentStakeAfter).to.be.bignumber.equal(
              computeNewCompliantStake({
                compliantGainPercentage,
                userStake: poolStakes[i],
              })
            )
          }
        })
      })
    })
  })
}

module.exports = itRunsFirstUpdateCorrectly
