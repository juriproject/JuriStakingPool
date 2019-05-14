const assert = require('assert')
const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultCompliantGainPercentage,
  defaultFeePercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultPeriodLength,
  defaultUpdateIterationCount,
  getDefaultJuriAddress,
  ONE_HUNDRED_TOKEN,
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
  computeNewNonCompliantStake,
  computeTotalPayout,
  computeTotalStakeToSlash,
  computeUnderWriterLiability,
} = require('./computationHelpers')

const itRunsSecondUpdateCorrectly = async addresses => {
  describe.only('when running second the update', async () => {
    let complianceData,
      compliantThreshold,
      pool,
      poolUsers,
      poolStakes,
      token,
      totalPayout,
      totalStakeToSlash

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length)
        .fill(false)
        .fill(true, poolUsers.length / 2)
      compliantThreshold = Math.round((poolUsers.length + 1) / 2) - 1

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
      await time.increase(defaultPeriodLength)

      await pool.addWasCompliantDataForUsers(
        defaultUpdateIterationCount,
        complianceData
      )

      await runFullFirstUpdate({
        pool,
        poolUsers,
        updateIterationCount: defaultUpdateIterationCount,
      })

      totalStakeToSlash = computeTotalStakeToSlash({
        compliantThreshold,
        poolStakes,
      })

      totalPayout = computeTotalPayout({
        compliantGainPercentage: defaultCompliantGainPercentage,
        compliantThreshold,
        feePercentage: defaultFeePercentage,
        poolStakes,
      })
    })

    describe('when called by owner', async () => {
      it('does not revert the transaction', async () => {
        try {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
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
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount,
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
          defaultUpdateIterationCount
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
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
            defaultUpdateIterationCount
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
      })

      describe('when given half compliant users', async () => {
        beforeEach(async () => {
          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 2)

          compliantThreshold = poolUsers.length / 2 - 1

          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )

          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })
        })

        it('computes it correctly', async () => {
          if (poolUsers.length > 1) {
            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))
            const { useMaxNonCompliancy } = await pool.currentStakingRound()

            expect(useMaxNonCompliancy).to.be.true
          }
        })
      })

      describe('when given 3/4 compliant users', async () => {
        beforeEach(async () => {
          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 1.3333333333)

          compliantThreshold = poolUsers.length / 1.3333333333 - 1

          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )

          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })
        })

        it('computes it correctly', async () => {
          if (poolUsers.length > 1) {
            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))
            const { useMaxNonCompliancy } = await pool.currentStakingRound()

            expect(useMaxNonCompliancy).to.be.false
          }
        })
      })
    })

    describe('when running the last round', async () => {
      beforeEach(async () => {
        if (poolUsers.length > 1) {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            poolUsers.length - 1
          )
        }
      })

      describe('when handling the juri fees', async () => {
        it('computes them correctly', async () => {
          const juriAddress = getDefaultJuriAddress()
          const balanceBefore = await token.balanceOf(juriAddress)

          await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))

          const balanceAfter = await token.balanceOf(juriAddress)

          const totalUserStake = poolStakes.reduce(
            (totalStake, userStake) => totalStake.add(userStake),
            new BN(0)
          )
          const expectedJuriFees = computeJuriFees({
            feePercentage: defaultFeePercentage,
            totalUserStake,
          })

          expect(balanceAfter).to.be.bignumber.equal(
            balanceBefore.add(expectedJuriFees)
          )
        })

        describe('when handling high juri fees', async () => {
          let feePercentage

          beforeEach(async () => {
            feePercentage = new BN(40)
            const deployedContracts = await deployJuriStakingPool({
              addresses,
              feePercentage,
            })
            token = deployedContracts.token
            pool = deployedContracts.pool

            await initialPoolSetup({
              pool,
              poolUsers,
              poolStakes,
              token,
            })
            await time.increase(defaultPeriodLength)

            await pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData
            )

            await runFullFirstUpdate({
              pool,
              poolUsers,
              updateIterationCount: defaultUpdateIterationCount,
            })

            if (poolUsers.length > 1) {
              await pool.secondUpdateStakeForNextXAmountOfUsers(
                poolUsers.length - 1
              )
            }
          })

          it('computes them correctly', async () => {
            const juriAddress = getDefaultJuriAddress()
            const balanceBefore = await token.balanceOf(juriAddress)

            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))

            const balanceAfter = await token.balanceOf(juriAddress)

            const totalUserStake = poolStakes.reduce(
              (totalStake, userStake) => totalStake.add(userStake),
              new BN(0)
            )
            const expectedJuriFees = computeJuriFees({
              feePercentage,
              totalUserStake,
            })

            expect(balanceAfter).to.be.bignumber.equal(
              balanceBefore.add(expectedJuriFees)
            )
          })
        })
      })

      describe('when handling the underwriting', async () => {
        describe('when using the max non compliancy', async () => {
          it('underwrites the liablity from owner funds', async () => {
            const ownerFundsBefore = await pool.ownerFunds()

            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))

            const ownerFundsAfter = await pool.ownerFunds()
            const expectedUnderWriterLiability = computeUnderWriterLiability({
              maxNonCompliantPenaltyPercentage: defaultMaxNonCompliantPenaltyPercentage,
              totalPayout,
              totalStakeToSlash,
            })

            expect(ownerFundsAfter).to.be.bignumber.equal(
              ownerFundsBefore.sub(expectedUnderWriterLiability)
            )
          })
        })

        describe('when not using the max non compliancy', async () => {
          beforeEach(async () => {
            await pool.secondUpdateStakeForNextXAmountOfUsers(
              defaultUpdateIterationCount
            )
            await time.increase(defaultPeriodLength)

            complianceData = new Array(poolUsers.length)
              .fill(false)
              .fill(true, Math.round(poolUsers.length / 1.3333333333))

            compliantThreshold = poolUsers.length / 1.3333333333 - 1

            await pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData
            )

            await runFullFirstUpdate({
              pool,
              poolUsers,
              updateIterationCount: defaultUpdateIterationCount,
            })
          })

          it('does not underwrite', async () => {
            const ownerFundsBefore = await pool.ownerFunds()

            console.log({ complianceData, compliantThreshold })

            await pool.secondUpdateStakeForNextXAmountOfUsers(
              defaultUpdateIterationCount
            )

            const ownerFundsAfter = await pool.ownerFunds()

            expect(ownerFundsAfter).to.be.bignumber.equal(ownerFundsBefore)
          })
        })
      })

      describe('when resetting pool for next round', async () => {
        describe('when adding users', async () => {
          /* see add user tests */
        })

        describe('when removing users', async () => {
          /* see remove user tests */
        })

        describe('when contract is not sufficiently funded for next round', async () => {
          beforeEach(async () => {
            await pool.secondUpdateStakeForNextXAmountOfUsers(
              poolUsers.length - 1
            )
            await time.increase(defaultPeriodLength)

            await pool.withdrawOwnerFunds(ONE_HUNDRED_TOKEN)

            complianceData = new Array(poolUsers.length).fill(true)
            await pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData
            )
            await runFullFirstUpdate({
              pool,
              poolUsers,
              updateIterationCount: defaultUpdateIterationCount,
            })

            if (poolUsers.length > 1) {
              await pool.secondUpdateStakeForNextXAmountOfUsers(
                poolUsers.length - 1
              )
            }
          })

          it('reverts the last update', async () => {
            await shouldFail.reverting.withMessage(
              pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1)),
              'Pool is not sufficiently funded by owner!'
            )
          })
        })

        describe('when contract is sufficiently funded for next round', async () => {
          it('sets the staking period variables for next round', async () => {
            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))

            const {
              addComplianceDataIndex,
              juriFees,
              nonCompliancePenalty,
              roundIndex,
              stage,
              totalPayout,
              totalStakeToSlash,
              updateStaking1Index,
              updateStaking2Index,
              useMaxNonCompliancy,
            } = await pool.currentStakingRound()

            expect(addComplianceDataIndex).to.be.bignumber.equal(new BN(0))
            expect(nonCompliancePenalty).to.be.bignumber.equal(new BN(0))
            expect(roundIndex).to.be.bignumber.equal(new BN(2))
            expect(stage).to.be.bignumber.equal(Stages.AWAITING_COMPLIANCE_DATA)
            expect(juriFees).to.be.bignumber.equal(totalPayout)
            expect(totalStakeToSlash).to.be.bignumber.equal(new BN(0))
            expect(updateStaking1Index).to.be.bignumber.equal(new BN(0))
            expect(updateStaking2Index).to.be.bignumber.equal(new BN(0))
            expect(useMaxNonCompliancy).to.be.false

            await shouldFail.reverting.withMessage(
              pool.getUserToBeAddedNextPeriod(0),
              'invalid opcode'
            )
          })

          it('computes the juri fees and sets total payout to fees', async () => {
            await pool.secondUpdateStakeForNextXAmountOfUsers(new BN(1))

            const { juriFees, totalPayout } = await pool.currentStakingRound()
            const expectedJuriFees = computeJuriFees({
              feePercentage: defaultFeePercentage,
              totalUserStake: poolStakes.reduce(
                (totalStake, userStake) => totalStake.add(userStake),
                new BN(0)
              ),
            })

            expect(juriFees).to.be.bignumber.equal(totalPayout)
            expect(expectedJuriFees).to.be.bignumber.equal(juriFees)
          })
        })
      })
    })

    describe('when given different updateIterationCounts', async () => {
      beforeEach(async () => {
        const deployedContracts = await deployJuriStakingPool({ addresses })

        pool = deployedContracts.pool
        token = deployedContracts.token

        poolUsers = addresses.slice(1, addresses.length) // without owner
        poolStakes = new Array(poolUsers.length).fill(new BN(1000))

        await initialPoolSetup({
          pool,
          poolUsers,
          poolStakes,
          token,
        })
        await time.increase(defaultPeriodLength)
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
                await pool.getStakeForUserInCurrentPeriod(poolUsers[i])
              )
              nextStakesBefore.push(
                await pool.getAdditionalStakeForUserInNextPeriod(poolUsers[i])
              )
            }

            await runFullSecondUpdate({
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
                new BN(currentStakesBefore[i]).add(nextStakesBefore[i])
              )
              expect(nextStakeAfter).to.be.bignumber.equal(new BN(0))
            }
          })
        })

        describe('when users are non-compliant', async () => {
          beforeEach(async () => {
            complianceData = new Array(poolUsers.length).fill(false)
            compliantThreshold = poolUsers.length
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
            await runFullFirstUpdate({ pool, poolUsers, updateIterationCount })

            totalStakeToSlash = computeTotalStakeToSlash({
              compliantThreshold,
              poolStakes,
            })
            const juriFees = computeJuriFees({
              feePercentage: defaultFeePercentage,
              totalUserStake: totalStakeToSlash,
            })
            totalPayout = juriFees
          })

          it('moves its users stake', async () => {
            const currentStakeBefore = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[0]
            )

            expect(currentStakeAfter).to.be.bignumber.above(currentStakeBefore)
          })

          it('adds stake from next period', async () => {
            await runFullSecondUpdate({ pool, poolUsers, updateIterationCount })

            for (let i = 0; i < poolUsers.length; i++) {
              const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
                poolUsers[i]
              )
              const nextStakeAfter = await pool.getAdditionalStakeForUserInNextPeriod(
                poolUsers[i]
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
                poolUsers[i]
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
              updateIterationCount
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
                updateIterationCount
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

          pool = deployedContracts.pool
          token = deployedContracts.token

          poolUsers = addresses.slice(1, addresses.length) // without owner
          poolStakes = new Array(poolUsers.length).fill(new BN(1000))

          await initialPoolSetup({
            pool,
            poolUsers,
            poolStakes,
            token,
          })
          await time.increase(defaultPeriodLength)

          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 2)
          compliantThreshold = poolUsers.length / 2 - 1

          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })

          totalStakeToSlash = computeTotalStakeToSlash({
            compliantThreshold,
            poolStakes,
          })

          totalPayout = computeTotalPayout({
            compliantGainPercentage: defaultCompliantGainPercentage,
            compliantThreshold,
            feePercentage: defaultFeePercentage,
            poolStakes,
          })
        })

        it('computes the new stakes correctly', async () => {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          )

          for (let i = 0; i < poolUsers.length / 2 - 1; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[i]
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

          pool = deployedContracts.pool
          token = deployedContracts.token

          poolUsers = addresses.slice(1, addresses.length) // without owner
          poolStakes = new Array(poolUsers.length).fill(new BN(1000))

          await initialPoolSetup({
            pool,
            poolUsers,
            poolStakes,
            token,
          })
          await time.increase(defaultPeriodLength)

          complianceData = new Array(poolUsers.length)
            .fill(false)
            .fill(true, poolUsers.length / 2)
          compliantThreshold = poolUsers.length / 2 - 1

          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
          await runFullFirstUpdate({
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })

          totalStakeToSlash = computeTotalStakeToSlash({
            compliantThreshold,
            poolStakes,
          })

          totalPayout = computeTotalPayout({
            compliantGainPercentage: defaultCompliantGainPercentage,
            compliantThreshold,
            feePercentage: defaultFeePercentage,
            poolStakes,
          })
        })

        it('computes the new stakes correctly', async () => {
          await pool.secondUpdateStakeForNextXAmountOfUsers(
            defaultUpdateIterationCount
          )

          for (let i = 0; i < poolUsers.length / 2 - 1; i++) {
            const currentStakeAfter = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[i]
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
