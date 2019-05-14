const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultCompliantGainPercentage,
  defaultPeriodLength,
  defaultUpdateIterationCount,
  ONE_TOKEN,
} = require('./defaults')
const {
  deployJuriStakingPool,
  initialPoolSetup,
  runFullCompleteRound,
} = require('./helpers')
const { computeNewCompliantStake } = require('./computationHelpers')

const itAddsNewUsersCorrectly = async ({ addresses, addressesToAdd }) => {
  describe('when adding users', async () => {
    let pool, poolUsers, poolStakes, stake, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [...addresses, ...addressesToAdd],
      })

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

      await Promise.all(
        addressesToAdd.map(user =>
          token.approve(pool.address, stake, { from: user })
        )
      )
    })

    describe('when called by an already existing pool user', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addUserInNextPeriod(ONE_TOKEN, { from: poolUsers[0] }),
          'Only non-members can use this function!'
        )
      })
    })

    describe('when called by an already pending pool user', async () => {
      beforeEach(async () => {
        await pool.addUserInNextPeriod(stake, { from: addressesToAdd[0] })
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addUserInNextPeriod(stake, { from: addressesToAdd[0] }),
          'Only non-pending pool users can use this function!'
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
          pool.addUserInNextPeriod(stake, { from: addressesToAdd[0] }),
          "Function can't be called at this time!"
        )
      })
    })

    describe('when called by not yet existing users', async () => {
      it('does not revert the transacion', async () => {
        try {
          await pool.addUserInNextPeriod(stake, { from: addressesToAdd[0] })
        } catch (error) {
          assert.fail(
            'The transaction for adding new user should not have been reverted!'
          )
        }
      })

      it('adds the users to the users to add list', async () => {
        for (let i = 0; i < addressesToAdd.length; i++) {
          await pool.addUserInNextPeriod(stake, { from: addressesToAdd[i] })
        }

        for (let i = 0; i < addressesToAdd.length; i++) {
          const userToBeAdded = await pool.getUserToBeAddedNextPeriod(i)
          expect(userToBeAdded).to.be.equal(addressesToAdd[i])
        }
      })

      it('activates staking for users in the next round', async () => {
        for (let i = 0; i < addressesToAdd.length; i++) {
          await pool.addUserInNextPeriod(stake, { from: addressesToAdd[i] })
        }

        for (let i = 0; i < addressesToAdd.length; i++) {
          const userWillBeStaking = await pool.getNextRoundStaking({
            from: addressesToAdd[i],
          })
          expect(userWillBeStaking).to.be.true
        }
      })

      it('adds the stake for user in the next round', async () => {
        for (let i = 0; i < addressesToAdd.length; i++) {
          await pool.addUserInNextPeriod(stake, { from: addressesToAdd[i] })
        }

        for (let i = 0; i < addressesToAdd.length; i++) {
          const addedStake = await pool.getAdditionalStakeForUserInNextPeriod(
            addressesToAdd[i]
          )
          expect(addedStake).to.be.bignumber.equal(stake)
        }
      })

      describe('when proceeding to next round', async () => {
        beforeEach(async () => {
          for (let i = 0; i < addressesToAdd.length; i++) {
            await pool.addUserInNextPeriod(stake, { from: addressesToAdd[i] })
          }

          await time.increase(defaultPeriodLength)

          await runFullCompleteRound({
            complianceData,
            pool,
            poolUsers,
            updateIterationCount: defaultUpdateIterationCount,
          })
        })

        it('adds users to pool', async () => {
          const allUsers = [...poolUsers, ...addressesToAdd]

          for (let i = 0; i < allUsers.length; i++) {
            const user = await pool.users(i)
            expect(user).to.be.equal(allUsers[i])
          }
        })

        it('adds user stakes to pool', async () => {
          for (let i = 0; i < poolUsers.length; i++) {
            const userStake = await pool.getStakeForUserInCurrentPeriod(
              poolUsers[i]
            )
            expect(userStake).to.be.bignumber.equal(
              computeNewCompliantStake({
                compliantGainPercentage: defaultCompliantGainPercentage,
                userStake: stake,
              })
            )
          }

          for (let i = 0; i < addressesToAdd.length; i++) {
            const userStake = await pool.getStakeForUserInCurrentPeriod(
              addressesToAdd[i]
            )
            expect(userStake).to.be.bignumber.equal(stake)
          }
        })
      })
    })
  })
}

module.exports = itAddsNewUsersCorrectly
