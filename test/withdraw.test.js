const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  deployJuriStakingPool,
  initialPoolSetup,
  runFullComplianceDataAddition,
} = require('./helpers')

const {
  defaultMinStakePerUser,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultPeriodLength,
  defaultUpdateIterationCount,
} = require('./defaults')
const { computeMaxLossNewStake } = require('./computationHelpers')

const itWithdrawsStakeCorrectly = async addresses => {
  let pool, poolUsers, poolStakes, token

  describe('when adding more stake', async () => {
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool
      poolUsers = addresses.slice(1, addresses.length) // without owner
      addedUserStakes = new Array(poolUsers.length).fill(new BN(5000))
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })

      for (let i = 0; i < poolUsers.length; i++) {
        await token.approve(pool.address, addedUserStakes[i], {
          from: poolUsers[i],
        })
        await pool.addMoreStakeForNextPeriod(addedUserStakes[i], {
          from: poolUsers[i],
        })
      }
    })

    it('withdraws from next period first', async () => {
      const withdrawAmount = new BN(100)

      for (let i = 0; i < poolUsers.length; i++) {
        await pool.withdraw(withdrawAmount, { from: poolUsers[i] })

        const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
          poolUsers[i]
        )
        const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
          poolUsers[i]
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[i])
        expect(stakeAtNextPeriod).to.be.bignumber.equal(
          addedUserStakes[i].sub(withdrawAmount)
        )
      }
    })

    it('withdraws from current period second', async () => {
      const withdrawAmount = new BN(5100)

      for (let i = 0; i < poolUsers.length; i++) {
        await pool.withdraw(withdrawAmount, { from: poolUsers[i] })

        const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
          poolUsers[i]
        )
        const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
          poolUsers[i]
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(
          poolStakes[i].add(addedUserStakes[i]).sub(withdrawAmount)
        )
        expect(stakeAtNextPeriod).to.be.bignumber.equal(new BN(0))
      }
    })

    it('transfers the withdrawn tokens back to the user', async () => {
      const withdrawAmount = new BN(5100)

      for (let i = 0; i < poolUsers.length; i++) {
        const userBalanceBefore = await token.balanceOf(poolUsers[i])
        await pool.withdraw(withdrawAmount, { from: poolUsers[i] })
        const userBalanceAfter = await token.balanceOf(poolUsers[i])

        expect(userBalanceAfter).to.be.bignumber.equal(
          userBalanceBefore.add(withdrawAmount)
        )
      }
    })

    describe('when called by a non-existant pool user', async () => {
      it('reverts the transacion', async () => {
        const owner = addresses[0]

        await shouldFail.reverting.withMessage(
          pool.withdraw(100, { from: owner }),
          'Only added pool users can use this function!'
        )
      })
    })

    describe('when called in incorrect stage', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
        await runFullComplianceDataAddition({
          complianceData: new Array(poolUsers.length).fill(true),
          pool,
          poolUsers,
          updateIterationCount: defaultUpdateIterationCount,
        })
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdraw(100, { from: poolUsers[0] }),
          'Function cannot be called at this time!'
        )
      })
    })

    describe('when withdrawing more than the min stake per user', async () => {
      beforeEach(async () => {
        await pool.withdraw(
          poolStakes[0].add(addedUserStakes[0]).sub(defaultMinStakePerUser),
          {
            from: poolUsers[0],
          }
        )
      })

      it('reverts the transaction', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdraw(new BN(1), {
            from: poolUsers[0],
          }),
          'Cannot withdraw more than minStakePerUser!'
        )
      })
    })

    describe('when withdrawing more than the safe amount', async () => {
      it('reverts the transaction', async () => {
        const safeStakingAmount = poolStakes[0].sub(
          computeMaxLossNewStake({
            maxNonCompliantPenaltyPercentage: defaultMaxNonCompliantPenaltyPercentage,
            userStake: poolStakes[0],
          })
        )

        await shouldFail.reverting.withMessage(
          pool.withdraw(
            poolStakes[0]
              .add(addedUserStakes[0])
              .sub(safeStakingAmount)
              .add(new BN(1)),
            {
              from: poolUsers[0],
            }
          ),
          'Cannot withdraw more than safe staking amount!'
        )
      })
    })
  })
}

module.exports = itWithdrawsStakeCorrectly
