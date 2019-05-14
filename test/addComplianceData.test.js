const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultUpdateIterationCount,
  getDefaultJuriAddress,
} = require('./defaults')
const { deployJuriStakingPool, initialPoolSetup, Stages } = require('./helpers')

const itAddsComplianceDataCorrectly = async addresses => {
  describe('when adding compliance data', async () => {
    let complianceData, complianceDataIndex, pool, poolUsers, poolStakes, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length)
        .fill(true)
        .fill(false, poolUsers.length / 2)

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
    })

    describe('when the current period is not yet finished', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          ),
          'Can only add new data after end of periodLength!'
        )
      })
    })

    describe('when the current period is finished', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
      })

      describe('when called by juriAddress', async () => {
        it('does not revert the transacion', async () => {
          try {
            pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData,
              { from: getDefaultJuriAddress() }
            )
          } catch (error) {
            assert.fail(
              'The transaction for adding compliance ' +
                'data when called by juriAddress should not have been reverted!'
            )
          }
        })
      })

      describe('when not called by juriAddress', async () => {
        it('reverts the transacion', async () => {
          await shouldFail.reverting.withMessage(
            pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData,
              { from: poolUsers[0] }
            ),
            'Only juriAddress can use this function!'
          )
        })
      })

      describe('when called in stage AWAITING_COMPLIANCE_DATA', async () => {
        it('does not revert the transacion', async () => {
          try {
            pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData
            )
          } catch (error) {
            assert.fail(
              'The transaction for adding compliance ' +
                'data when called in stage AWAITING_COMPLIANCE_DATA ' +
                'should not have been reverted!'
            )
          }
        })
      })

      describe('when not called in stage AWAITING_COMPLIANCE_DATA', async () => {
        beforeEach(async () => {
          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
        })

        it('reverts the transacion', async () => {
          await shouldFail.reverting.withMessage(
            pool.addWasCompliantDataForUsers(
              defaultUpdateIterationCount,
              complianceData
            ),
            "Function can't be called at this time!"
          )
        })
      })

      describe('when given different updateIterationCounts', async () => {
        const itAddsCompliancaDataCorrectlyWithIterationCount = async updateIterationCount => {
          beforeEach(async () => {
            complianceDataIndex = await pool.complianceDataIndex()

            await pool.addWasCompliantDataForUsers(
              updateIterationCount,
              complianceData
            )
          })

          it('adds updateIterationCount to addComplianceDataIndex', async () => {
            const { addComplianceDataIndex } = await pool.currentStakingRound()
            expect(addComplianceDataIndex).to.be.bignumber.equal(
              updateIterationCount
            )
          })

          it('stores the compliance data at correct index', async () => {
            const complianceDataForUsers = await Promise.all(
              poolUsers.map((user, i) =>
                new BN(i).gte(updateIterationCount)
                  ? complianceData[i]
                  : pool.complianceDataAtIndex(complianceDataIndex, user)
              )
            )

            expect(complianceDataForUsers).to.eql(complianceData)
          })
        }

        describe('when using a small updateIterationCount', async () => {
          const updateIterationCount = new BN(1)

          itAddsCompliancaDataCorrectlyWithIterationCount(updateIterationCount)
        })

        describe('when using a high updateIterationCount', async () => {
          const updateIterationCount = new BN(1000)

          itAddsCompliancaDataCorrectlyWithIterationCount(updateIterationCount)
        })
      })

      describe('when running the last addition iteration', async () => {
        beforeEach(async () => {
          complianceDataIndex = await pool.complianceDataIndex()

          await pool.addWasCompliantDataForUsers(
            defaultUpdateIterationCount,
            complianceData
          )
        })

        it('increments complianceDataIndex', async () => {
          const newComplianceDataIndex = await pool.complianceDataIndex()

          expect(newComplianceDataIndex).to.be.bignumber.equal(
            complianceDataIndex.add(new BN(1))
          )
        })

        it('advances the stage to AWAITING_FIRST_UPDATE', async () => {
          const { stage } = await pool.currentStakingRound()

          expect(stage).to.be.bignumber.equal(Stages.AWAITING_FIRST_UPDATE)
        })
      })
    })
  })
}

module.exports = itAddsComplianceDataCorrectly
