const { expect } = require('chai')
const { BN, shouldFail } = require('openzeppelin-test-helpers')

const { initialPoolSetup } = require('./helpers')

const itAddsMoreStakeCorrectly = async addresses => {
  let addedStakes, pool, poolUsers, poolStakes, token

  describe('when adding more stake', async () => {
    beforeEach(async () => {
      const deployedContracts = await deploypool({
        addresses: [...addresses, ...addressesToAdd],
      })

      token = deployedContracts.token
      pool = deployedContracts.pool

      addedUserStake = new Array(poolUsers.length).fill(new BN(5000))
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

    it.only('adds stake to next period', async () => {
      await token.approve(pool.address, addedUserStake, {
        from: user1,
      })
      await pool.addMoreStakeForNextPeriod(addedUserStake, {
        from: user1,
      })

      const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
        user1
      )
      const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
        user1
      )

      expect(stakeAtCurrentPeriod).to.be.bignumber.equal(initialUserStake)
      expect(stakeAtNextPeriod).to.be.bignumber.equal(addedUserStake)
    })

    describe('when adding more than the maximum stake per user', async () => {
      it('fails with an error describing max per user is reached', async () => {
        await initialPoolSetup({
          pool: pool,
          poolUsers: [user1],
          poolStakes: [5000],
          token,
        })

        await token.approve(pool.address, ONE_HUNDRED_TOKEN, {
          from: user1,
        })

        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
            from: user1,
          }),
          'Cannot add more funds for user, because the max per user is reached!'
        )
      })
    })

    describe('when adding above the maximum total stake in pool', async () => {
      it('fails with an error describing max in pool is reached', async () => {
        await initialPoolSetup({
          pool: pool,
          poolUsers: [user1],
          poolStakes: [5000],
          token,
        })

        await token.approve(pool.address, ONE_HUNDRED_TOKEN, {
          from: user2,
        })
        await pool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
          from: user2,
        })

        await token.approve(pool.address, ONE_HUNDRED_TOKEN, {
          from: user3,
        })

        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
            from: user3,
          }),
          'Cannot add more funds to pool, because the max in pool is reached!'
        )
      })
    })
  })
}

module.exports = itAddsMoreStakeCorrectly
