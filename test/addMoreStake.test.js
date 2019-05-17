const { expect } = require('chai')
const { BN, shouldFail } = require('openzeppelin-test-helpers')

const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')
const {
  defaultMaxStakePerUser,
  ONE_HUNDRED_TOKEN,
  TWO_HUNDRED_TOKEN,
} = require('./defaults')

const itAddsMoreStakeCorrectly = async ({ addresses, addressesToAdd }) => {
  let addedUserStake, pool, poolUsers, poolStakes, token

  describe('when adding more stake', async () => {
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [...addresses, ...addressesToAdd],
      })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner

      addedUserStake = new Array(poolUsers.length).fill(new BN(5000))
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      complianceData = new Array(poolUsers.length).fill(true)

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })

      /* await Promise.all(
        addressesToAdd.map(user =>
          token.approve(pool.address, new BN(5000), { from: user })
        )
      ) */
    })

    it('adds stake to next period', async () => {
      for (let i = 0; i < poolUsers.length; i++) {
        await token.approve(pool.address, addedUserStake[i], {
          from: poolUsers[i],
        })
        await pool.addMoreStakeForNextPeriod(addedUserStake[i], {
          from: poolUsers[i],
        })

        const stakeAtCurrentPeriod = await pool.getStakeForUserInCurrentPeriod(
          poolUsers[i]
        )
        const stakeAtNextPeriod = await pool.getAdditionalStakeForUserInNextPeriod(
          poolUsers[i]
        )

        expect(stakeAtCurrentPeriod).to.be.bignumber.equal(poolStakes[i])
        expect(stakeAtNextPeriod).to.be.bignumber.equal(addedUserStake[i])
      }
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

    it.only('adds up to max of pool', async () => {
      const totalCurrentStake = poolStakes.reduce(
        (sum, stake) => sum.add(stake),
        new BN(0)
      )
      const leftToMax = new BN(6000)

      await token.approve(pool.address, ONE_HUNDRED_TOKEN.sub(poolStakes[0]), {
        from: poolUsers[0],
      })
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
    })

    describe('when the maximum total stake in pool is reached', async () => {
      beforeEach(async () => {
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
      })

      it('reverts for adding more stake with an error describing max in pool is reached', async () => {
        await shouldFail.reverting.withMessage(
          pool.addMoreStakeForNextPeriod(100, {
            from: poolUsers[2],
          }),
          'Cannot add more funds to pool, because the max in pool is reached!'
        )
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
