const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')
const {
  defaultMaxStakePerUser,
  defaultPeriodLength,
  defaultUpdateIterationCount,
  ONE_HUNDRED_TOKEN,
  TWO_HUNDRED_TOKEN,
} = require('./defaults')

const itAddsMoreStakeCorrectly = async ({ addresses, addressesToAdd }) => {
  let addedUserStakes,
    complianceData,
    newUsersAddedStakes,
    newUsersStakes,
    pool,
    poolUsers,
    poolStakes,
    token

  describe('when adding more stake', async () => {
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [...addresses, ...addressesToAdd],
      })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner

      addedUserStakes = new Array(poolUsers.length).fill(new BN(5000))
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length).fill(true)
      newUsersStakes = new Array(addressesToAdd.length).fill(new BN(2000))
      newUsersAddedStakes = new Array(addressesToAdd.length).fill(new BN(3000))

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
    })

    it('adds stake to next period', async () => {
      for (let i = 0; i < poolUsers.length; i++) {
        await token.approve(pool.address, addedUserStakes[i], {
          from: poolUsers[i],
        })
        await pool.addMoreStakeForNextPeriod(addedUserStakes[i], {
          from: poolUsers[i],
        })

        const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
          poolUsers[i]
        )
        const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
          poolUsers[i]
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[i])
        expect(stakeAtNextPeriod).to.be.bignumber.equal(addedUserStakes[i])
      }
    })

    it('adds stake to total added stake in next round', async () => {
      let totalAddedStakeBefore = await pool.nextStakingRound()

      for (let i = 0; i < poolUsers.length; i++) {
        await token.approve(pool.address, addedUserStakes[i], {
          from: poolUsers[i],
        })
        await pool.addMoreStakeForNextPeriod(addedUserStakes[i], {
          from: poolUsers[i],
        })

        const totalAddedStake = await pool.nextStakingRound()

        expect(totalAddedStake).to.be.bignumber.equal(
          totalAddedStakeBefore.add(addedUserStakes[i])
        )

        totalAddedStakeBefore = totalAddedStake
      }
    })

    describe('when passing an amount of 0', async () => {
      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(0, {
            from: poolUsers[0],
          }),
          'Please pass an amount higher than 0!'
        )
      })
    })

    describe('when called by a non-existant pool user', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(newUsersStakes[0], {
            from: addressesToAdd[0],
          }),
          'Only pool users or pending pool users can use this function!'
        )
      })
    })

    describe('when called without approving tokens before', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(addedUserStakes[0], {
            from: poolUsers[0],
          }),
          'Cannot transfer more than approved!'
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
          pool.addUserInNextPeriod(addedUserStakes[0], {
            from: addressesToAdd[0],
          }),
          'Function cannot be called at this time!'
        )
      })
    })

    describe('when called with different amounts', async () => {
      let amount

      describe('when called with small amount', async () => {
        beforeEach(async () => {
          amount = new BN(1)
        })

        it('adds new stake correctly', async () => {
          await token.approve(pool.address, amount, {
            from: poolUsers[0],
          })
          await pool.addMoreStakeForNextPeriod(amount, {
            from: poolUsers[0],
          })

          const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
            poolUsers[0]
          )
          const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
            poolUsers[0]
          )

          expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[0])
          expect(stakeAtNextPeriod).to.be.bignumber.equal(amount)
        })
      })

      describe('when called with high amount', async () => {
        beforeEach(async () => {
          amount = ONE_HUNDRED_TOKEN.sub(new BN(1000))
        })

        it('adds new stake correctly', async () => {
          await token.approve(pool.address, amount, {
            from: poolUsers[0],
          })
          await pool.addMoreStakeForNextPeriod(amount, {
            from: poolUsers[0],
          })

          const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
            poolUsers[0]
          )
          const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
            poolUsers[0]
          )

          expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[0])
          expect(stakeAtNextPeriod).to.be.bignumber.equal(amount)
        })
      })
    })

    describe('when there are pending users', async () => {
      beforeEach(async () => {
        await Promise.all(
          addressesToAdd.map((user, i) =>
            token.approve(pool.address, newUsersStakes[i], { from: user })
          )
        )

        for (let i = 0; i < addressesToAdd.length; i++) {
          await pool.addUserInNextPeriod(newUsersStakes[i], {
            from: addressesToAdd[i],
          })
        }
      })

      it('adds new stake to pending stake', async () => {
        for (let i = 0; i < addressesToAdd.length; i++) {
          await token.approve(pool.address, newUsersAddedStakes[i], {
            from: addressesToAdd[i],
          })
          await pool.addMoreStakeForNextPeriod(newUsersAddedStakes[i], {
            from: addressesToAdd[i],
          })

          const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
            addressesToAdd[i]
          )
          const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
            addressesToAdd[i]
          )

          expect(stakeAtCurrentPeriod).to.be.bignumber.equal(new BN(0))
          expect(stakeAtNextPeriod).to.be.bignumber.equal(
            newUsersStakes[i].add(newUsersAddedStakes[i])
          )
        }
      })
    })

    it('adds up to max stake per user', async () => {
      await token.approve(pool.address, TWO_HUNDRED_TOKEN, {
        from: poolUsers[0],
      })
      await pool.addMoreStakeForNextPeriod(TWO_HUNDRED_TOKEN, {
        from: poolUsers[0],
      })

      const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
        poolUsers[0]
      )
      const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
        poolUsers[0]
      )

      expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[0])
      expect(stakeAtNextPeriod).to.be.bignumber.equal(
        defaultMaxStakePerUser.sub(poolStakes[0])
      )
    })

    it('adds up to max of pool', async () => {
      if (poolUsers.length > 1) {
        const totalCurrentStake = poolStakes.reduce(
          (sum, stake) => sum.add(stake),
          new BN(0)
        )
        const leftToMax = new BN(6000)

        await token.approve(
          pool.address,
          ONE_HUNDRED_TOKEN.sub(poolStakes[0]),
          {
            from: poolUsers[0],
          }
        )
        await pool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
          from: poolUsers[0],
        })

        await token.approve(
          pool.address,
          ONE_HUNDRED_TOKEN.sub(leftToMax).sub(totalCurrentStake),
          {
            from: poolUsers[1],
          }
        )
        await pool.addMoreStakeForNextPeriod(
          ONE_HUNDRED_TOKEN.sub(leftToMax).sub(totalCurrentStake),
          {
            from: poolUsers[1],
          }
        )

        await token.approve(pool.address, ONE_HUNDRED_TOKEN, {
          from: poolUsers[2],
        })
        await pool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
          from: poolUsers[2],
        })

        const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
          poolUsers[2]
        )
        const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
          poolUsers[2]
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[2])
        expect(stakeAtNextPeriod).to.be.bignumber.equal(
          leftToMax.add(poolStakes[0])
        )
      }
    })

    describe('when the maximum total stake in pool is reached', async () => {
      beforeEach(async () => {
        if (poolUsers.length > 1) {
          await token.approve(pool.address, TWO_HUNDRED_TOKEN, {
            from: poolUsers[0],
          })
          await pool.addMoreStakeForNextPeriod(TWO_HUNDRED_TOKEN, {
            from: poolUsers[0],
          })

          await token.approve(pool.address, TWO_HUNDRED_TOKEN, {
            from: poolUsers[1],
          })
          await pool.addMoreStakeForNextPeriod(TWO_HUNDRED_TOKEN, {
            from: poolUsers[1],
          })
        }
      })

      it('reverts for adding more stake with an error describing max in pool is reached', async () => {
        if (poolUsers.length > 1) {
          await shouldFail.reverting.withMessage(
            pool.addMoreStakeForNextPeriod(100, {
              from: poolUsers[2],
            }),
            'Cannot add more funds to pool, because the max in pool is reached!'
          )
        }
      })
    })

    describe('when the maximum total stake for user is reached', async () => {
      beforeEach(async () => {
        await token.approve(pool.address, TWO_HUNDRED_TOKEN, {
          from: poolUsers[0],
        })
        await pool.addMoreStakeForNextPeriod(TWO_HUNDRED_TOKEN, {
          from: poolUsers[0],
        })

        await token.approve(pool.address, 100, {
          from: poolUsers[0],
        })
      })

      it('reverts for adding more stake with an error describing max per user is reached', async () => {
        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(100, {
            from: poolUsers[0],
          }),
          'Cannot add more funds for user, because the max per user is reached!'
        )
      })
    })
  })
}

module.exports = itAddsMoreStakeCorrectly
