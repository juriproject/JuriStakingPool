const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultUpdateIterationCount,
} = require('./defaults')
const {
  deployJuriStakingPool,
  expectUserCountToBe,
  initialPoolSetup,
  runFullCompleteRound,
} = require('./helpers')

const itRemovesNewUsersCorrectly = async addresses => {
  describe('when removing users', async () => {
    let pool, poolUsers, poolStakes, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool

      stake = new BN(1000)
      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(stake)
      complianceData = new Array(poolUsers.length).fill(true)

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
    })

    describe('when called by a non-existant pool user', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.removeUserInNextPeriod({ from: addresses[0] }),
          'Only added pool users can use this function!'
        )
      })
    })

    describe('when called by an already pending to-be-removed pool user', async () => {
      beforeEach(async () => {
        await pool.removeUserInNextPeriod({ from: poolUsers[0] })
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.removeUserInNextPeriod({ from: poolUsers[0] }),
          'User already marked for removal!'
        )
      })
    })

    describe('when called in incorrect stage', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
        await pool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          complianceData
        )
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.removeUserInNextPeriod({ from: poolUsers[0] }),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when called by not yet existing users', async () => {
      it('does not revert the transacion', async () => {
        try {
          await pool.removeUserInNextPeriod({
            from: poolUsers[0],
          })
        } catch (error) {
          assert.fail(
            'The transaction for removing new user should not have been reverted!'
          )
        }
      })

      it('flags the user to be removed', async () => {
        for (let i = 0; i < poolUsers.length; i++) {
          await pool.removeUserInNextPeriod({
            from: poolUsers[i],
          })
        }

        for (let i = 0; i < poolUsers.length; i++) {
          const userFlag = await pool.getIsLeavingNextPeriodForUser(
            poolUsers[i]
          )
          expect(userFlag).to.be.true
        }
      })

      it('deactivates staking for users in the next round', async () => {
        for (let i = 0; i < poolUsers.length; i++) {
          await pool.removeUserInNextPeriod({
            from: poolUsers[i],
          })
        }

        for (let i = 0; i < poolUsers.length; i++) {
          const userWillBeStaking = await pool.getNextRoundStaking({
            from: poolUsers[i],
          })
          expect(userWillBeStaking).to.be.false
        }
      })

      it('removes the stakes for users in the next round', async () => {
        for (let i = 0; i < poolUsers.length; i++) {
          await pool.removeUserInNextPeriod({ from: poolUsers[i] })
        }

        await time.increase(defaultPeriodLength)

        await runFullCompleteRound({
          complianceData,
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })

        const totalStakeAfter = await pool.totalUserStake()
        expect(totalStakeAfter).to.be.bignumber.equal(new BN(0))
      })

      it('removes them after a round', async () => {
        for (let i = 0; i < poolUsers.length; i++) {
          await pool.removeUserInNextPeriod({ from: poolUsers[i] })
        }

        await expectUserCountToBe({
          pool,
          expectedUserCount: poolUsers.length,
        })

        await time.increase(defaultPeriodLength)

        await runFullCompleteRound({
          complianceData,
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })

        await expectUserCountToBe({
          pool,
          expectedUserCount: 0,
        })
      })
    })
  })
}

module.exports = itRemovesNewUsersCorrectly
