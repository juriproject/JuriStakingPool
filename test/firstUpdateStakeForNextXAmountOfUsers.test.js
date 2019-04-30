const assert = require('assert')
const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultCompliantGainPercentage,
  defaultUpdateIterationCount,
} = require('./defaults')

const { deployJuriStakingPool, initialPoolSetup, Stages } = require('./helpers')

const { computeNewCompliantStake } = require('./computationHelpers')

const itRunsFirstUpdateCorrectly = async ([
  owner,
  user1,
  user2,
  user3,
  user4,
]) => {
  describe('when running first update', async () => {
    let addedUserStake,
      complianceData,
      juriStakingPool,
      pool,
      poolStakes,
      poolUsers,
      token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        poolUsers: [owner, user1, user2, user3, user4],
      })

      token = deployedContracts.token
      juriStakingPool = deployedContracts.pool

      complianceData = [false, false, true, true]
      poolUsers = [user1, user2, user3, user4]
      poolStakes = [1000, 1000, 1000, 1000].map(s => new BN(s))

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

      pool = juriStakingPool
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
              from: user1,
            }
          ),
          'Only owner can use this function!'
        )
      })
    })

    describe('when called in stage AWAITING_SECOND_UPDATE', async () => {
      beforeEach(async () => {
        await pool.firstUpdateStakeForNextXAmountOfUsers(
          defaultUpdateIterationCount
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          ),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when called in stage AWAITING_COMPLIANCE_DATA', async () => {
      beforeEach(async () => {
        const removalIndices = await pool.getRemovalIndicesInUserList()
        await pool.firstUpdateStakeForNextXAmountOfUsers(
          defaultUpdateIterationCount
        )
        await pool.secondUpdateStakeForNextXAmountOfUsers(
          defaultUpdateIterationCount,
          removalIndices
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.firstUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          ),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when given different updateIterationCounts', async () => {
      let updateIterationCount

      describe('when using a small updateIterationCount', async () => {
        beforeEach(async () => {
          updateIterationCount = new BN(1)
        })

        describe('when there is only one user', async () => {
          beforeEach(async () => {
            const deployedContracts = await deployJuriStakingPool({
              poolUsers: [owner, user1, user2, user3, user4],
            })

            juriStakingPool = deployedContracts.pool
            token = deployedContracts.token

            poolUsers = [user1]
            poolStakes = [new BN(1000)]

            await initialPoolSetup({
              pool: juriStakingPool,
              poolUsers,
              poolStakes,
              token,
            })
            await time.increase(defaultPeriodLength)

            pool = juriStakingPool
          })

          describe('when user is not staking', async () => {
            beforeEach(async () => {
              await pool.optOutOfStakingForNextPeriod({ from: user1 })

              complianceData = [true]
              await pool.addWasCompliantDataForUsers(
                updateIterationCount,
                complianceData
              )
              const removalIndices = await pool.getRemovalIndicesInUserList()
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
              await pool.secondUpdateStakeForNextXAmountOfUsers(
                updateIterationCount,
                removalIndices
              )
              await time.increase(defaultPeriodLength)

              await pool.addWasCompliantDataForUsers(
                updateIterationCount,
                complianceData
              )
            })

            it('does not update or move its user stake', async () => {
              const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              const nextStakeBefore = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: user1 }
              )

              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: user1 }
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                new BN(currentStakeBefore)
              )
              expect(nextStakeAfter).to.be.bignumber.equal(nextStakeBefore)
            })
          })

          describe('when user is compliant', async () => {
            beforeEach(async () => {
              complianceData = [true]
              addedUserStake = new BN(500)
              await token.approve(pool.address, addedUserStake, { from: user1 })
              await pool.addMoreStakeForNextPeriod({ from: user1 })

              await pool.addWasCompliantDataForUsers(
                updateIterationCount,
                complianceData
              )
            })

            it('moves its user stake', async () => {
              const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )

              expect(currentStakeAfter).to.be.bignumber.above(
                currentStakeBefore
              )
            })

            it('adds stake from next period', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: user1 }
              )

              expect(nextStakeAfter).to.be.bignumber.equal(new BN(0))
              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake: poolStakes[0],
                }).add(addedUserStake)
              )
            })

            it('updates the total user stake accordingly', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
              const totalUserStakeAfter = await pool.totalUserStake()

              expect(totalUserStakeAfter).to.be.bignumber.equal(
                computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake: poolStakes[0],
                }).add(addedUserStake)
              )
            })

            it('does not change the totalStakeToSlash for the current round', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const { totalStakeToSlash } = await pool.currentStakingRound()
              expect(totalStakeToSlash).to.be.bignumber.equal(new BN(0))
            })

            it('adds the compliant factor to the user stake', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                computeNewCompliantStake({
                  compliantGainPercentage: defaultCompliantGainPercentage,
                  userStake: poolStakes[0],
                }).add(addedUserStake)
              )
            })

            it('adds gain for user to the total payout for current round', async () => {
              const totalPayoutBefore = (await pool.currentStakingRound())
                .totalPayout

              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const totalPayoutAfter = (await pool.currentStakingRound())
                .totalPayout

              expect(totalPayoutAfter).to.be.bignumber.equal(
                totalPayoutBefore.add(
                  computeNewCompliantStake({
                    compliantGainPercentage: defaultCompliantGainPercentage,
                    userStake: poolStakes[0],
                  }).sub(poolStakes[0])
                )
              )
            })

            it('adds updateIterationCount to updateStaking1Index', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
              const { updateStaking1Index } = await pool.currentStakingRound()
              expect(updateStaking1Index).to.be.bignumber.equal(new BN(1))
            })

            it('updates the stage to AWAITING_SECOND_UPDATE', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )
              const { stage } = await pool.currentStakingRound()
              expect(stage).to.be.bignumber.equal(Stages.AWAITING_SECOND_UPDATE)
            })
          })

          describe('when user is non-compliant', async () => {
            beforeEach(async () => {
              complianceData = [false]
              await pool.addWasCompliantDataForUsers(
                updateIterationCount,
                complianceData
              )
            })

            it('changes the totalStakeToSlash for the current round', async () => {
              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const { totalStakeToSlash } = await pool.currentStakingRound()
              expect(totalStakeToSlash).to.be.bignumber.equal(poolStakes[0])
            })

            it('does not update or move its user stake', async () => {
              const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              const nextStakeBefore = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: user1 }
              )

              await pool.firstUpdateStakeForNextXAmountOfUsers(
                updateIterationCount
              )

              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                { from: user1 }
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                { from: user1 }
              )

              expect(currentStakeAfter).to.be.bignumber.equal(
                new BN(currentStakeBefore)
              )
              expect(nextStakeAfter).to.be.bignumber.equal(nextStakeBefore)
            })
          })
        })
      })
    })

    describe('when there are normal amount of users', async () => {})
    describe('when there are only a few users', async () => {})
    describe('when there are no users', async () => {})
  })
}

module.exports = itRunsFirstUpdateCorrectly
