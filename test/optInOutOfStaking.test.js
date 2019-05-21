const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')

const {
  defaultPeriodLength,
  defaultUpdateIterationCount,
} = require('./defaults')

const itChecksContraintsOnOptingInOutOfStaking = async addresses => {
  let pool, poolUsers, poolStakes, token

  describe('when switching staking', async () => {
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
    })

    it('switches the staking for next round', async () => {
      const isStakingNextRound1 = await pool.getIsNextRoundStaking({
        from: poolUsers[0],
      })
      expect(isStakingNextRound1).to.be.true

      await pool.optOutOfStakingForNextPeriod({ from: poolUsers[0] })
      const isStakingNextRound2 = await pool.getIsNextRoundStaking({
        from: poolUsers[0],
      })
      expect(isStakingNextRound2).to.be.false

      await pool.optInForStakingForNextPeriod({ from: poolUsers[0] })
      const isStakingNextRound3 = await pool.getIsNextRoundStaking({
        from: poolUsers[0],
      })
      expect(isStakingNextRound3).to.be.true
    })

    describe('when called by a non-existant pool user', async () => {
      describe('when opting in to staking', async () => {
        it('reverts the transacion', async () => {
          const owner = addresses[0]

          await shouldFail.reverting.withMessage(
            pool.optInForStakingForNextPeriod({ from: owner }),
            'Only pool users or pending pool users can use this function!'
          )
        })
      })

      describe('when opting out of staking', async () => {
        it('reverts the transacion', async () => {
          const owner = addresses[0]

          await shouldFail.reverting.withMessage(
            pool.optInForStakingForNextPeriod({ from: owner }),
            'Only pool users or pending pool users can use this function!'
          )
        })
      })
    })

    describe('when called in incorrect stage', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
        await pool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          new Array(poolUsers.length).fill(true)
        )
      })

      describe('when opting in to staking', async () => {
        it('reverts the transacion', async () => {
          await shouldFail.reverting.withMessage(
            pool.optInForStakingForNextPeriod({ from: poolUsers[0] }),
            'Function cannot be called at this time!'
          )
        })
      })

      describe('when opting out of staking', async () => {
        it('reverts the transacion', async () => {
          await shouldFail.reverting.withMessage(
            pool.optOutOfStakingForNextPeriod({ from: poolUsers[0] }),
            'Function cannot be called at this time!'
          )
        })
      })
    })
  })
}

module.exports = itChecksContraintsOnOptingInOutOfStaking
