const { expect } = require('chai')
const { BN, shouldFail, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultMinStakePerUser,
  defaultMaxStakePerUser,
  defaultMaxTotalStake,
  defaultUpdateIterationCount,
  ONE_TOKEN,
  ONE_HUNDRED_TOKEN,
} = require('./defaults')

const { computeMinOwnerFunds } = require('./computationHelpers')
const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')

const itSetsPoolDefinition = async pool => {
  const poolDefinition = await pool.poolDefinition()
  const {
    compliantGainPercentage,
    feePercentage,
    maxNonCompliantPenaltyPercentage,
    maxStakePerUser,
    minStakePerUser,
    maxTotalStake,
    periodLength,
    startTime,
  } = poolDefinition

  expect(periodLength).to.be.bignumber.equal(defaultPeriodLength)
  expect(feePercentage).to.be.bignumber.equal(defaultFeePercentage)
  expect(compliantGainPercentage).to.be.bignumber.equal(
    defaultCompliantGainPercentage
  )
  expect(maxNonCompliantPenaltyPercentage).to.be.bignumber.equal(
    defaultMaxNonCompliantPenaltyPercentage
  )
  expect(minStakePerUser).to.be.bignumber.equal(defaultMinStakePerUser)
  expect(maxStakePerUser).to.be.bignumber.equal(defaultMaxStakePerUser)
  expect(maxTotalStake).to.be.bignumber.equal(defaultMaxTotalStake)

  const expectedEarliestTime = await time.latest()
  const expectedLatestTime = (await time.latest()).add(
    time.duration.seconds(40)
  )
  expect(startTime).to.be.bignumber.gt(expectedEarliestTime)
  expect(startTime).to.be.bignumber.lt(expectedLatestTime)
}

const itCorrectlyAddsOwnerFunds = async addresses => {
  describe('when adding owner funds', () => {
    let notOwner, owner, pool, poolUsers, poolStakes, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool
      owner = addresses[0]
      notOwner = addresses[1]
      poolUsers = addresses.slice(1, addresses.length) // without owner
      addedUserStakes = new Array(poolUsers.length).fill(new BN(5000))
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })

      await token.approve(pool.address, ONE_TOKEN, { from: owner })
    })

    describe('when called in incorrect stage', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
        await pool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          new Array(poolUsers.length).fill(true)
        )
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addOwnerFunds(ONE_TOKEN, { from: owner }),
          'Function cannot be called at this time!'
        )
      })
    })

    describe('when not called by owner', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addOwnerFunds(ONE_TOKEN, { from: notOwner }),
          'Only owner can use this function!'
        )
      })
    })

    describe('when passing an amount of 0', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addOwnerFunds(0, { from: owner }),
          'Please pass an amount higher than 0!'
        )
      })
    })

    describe('when there are no tokens approved', async () => {
      beforeEach(async () => {
        await token.decreaseAllowance(pool.address, ONE_TOKEN, { from: owner })
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.addOwnerFunds(ONE_TOKEN, { from: owner }),
          'Cannot transfer more than approved!'
        )
      })
    })

    it('transfers tokens from owner to pool', async () => {
      const ownerBalanceBefore = await token.balanceOf(owner)
      const poolBalanceBefore = await token.balanceOf(pool.address)

      await pool.addOwnerFunds(ONE_TOKEN, { from: owner })

      const ownerBalanceAfter = await token.balanceOf(owner)
      const poolBalanceAfter = await token.balanceOf(pool.address)

      expect(ownerBalanceAfter).to.be.bignumber.equal(
        ownerBalanceBefore.sub(ONE_TOKEN)
      )
      expect(poolBalanceAfter).to.be.bignumber.equal(
        poolBalanceBefore.add(ONE_TOKEN)
      )
    })

    it('adds the funds to the owner funds inside the pool', async () => {
      const ownerBalanceBefore = await pool.ownerFunds()
      await pool.addOwnerFunds(ONE_TOKEN, { from: owner })
      const ownerBalanceAfter = await pool.ownerFunds()

      expect(ownerBalanceAfter).to.be.bignumber.equal(
        ownerBalanceBefore.add(ONE_TOKEN)
      )
    })
  })
}

const itCorrectlyWithdrawsOwnerFunds = async addresses => {
  describe('when adding owner funds', () => {
    let notOwner, owner, pool, poolUsers, poolStakes, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool
      owner = addresses[0]
      notOwner = addresses[1]
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

    describe('when called in incorrect stage', async () => {
      beforeEach(async () => {
        await time.increase(defaultPeriodLength)
        await pool.addWasCompliantDataForUsers(
          defaultUpdateIterationCount,
          new Array(poolUsers.length).fill(true)
        )
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdrawOwnerFunds(ONE_TOKEN, { from: owner }),
          'Function cannot be called at this time!'
        )
      })
    })

    describe('when not called by owner', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdrawOwnerFunds(ONE_TOKEN, { from: notOwner }),
          'Only owner can use this function!'
        )
      })
    })

    describe('when passing an amount of 0', async () => {
      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdrawOwnerFunds(0, { from: owner }),
          'Please pass an amount higher than 0!'
        )
      })
    })

    describe('when owner has only the min owner funds', async () => {
      beforeEach(async () => {
        await pool.withdrawOwnerFunds(ONE_HUNDRED_TOKEN, { from: owner })
      })

      it('reverts the transacion', async () => {
        await shouldFail.reverting.withMessage(
          pool.withdrawOwnerFunds(1, { from: owner }),
          'Cannot withdraw below min owner funds!'
        )
      })
    })

    describe('when owner withdraws more than min owner funds', async () => {
      it('reverts the transacion', async () => {
        await pool.withdrawOwnerFunds(ONE_HUNDRED_TOKEN, { from: owner })
        const ownerBalanceAfter = await pool.ownerFunds()

        const minOwnerFunds = computeMinOwnerFunds({
          compliantGainPercentage: defaultCompliantGainPercentage,
          poolStakes,
        })

        expect(ownerBalanceAfter).to.be.bignumber.equal(minOwnerFunds)
      })
    })

    it('transfers tokens from pool to owner', async () => {
      const ownerBalanceBefore = await token.balanceOf(owner)
      const poolBalanceBefore = await token.balanceOf(pool.address)

      await pool.withdrawOwnerFunds(ONE_TOKEN, { from: owner })

      const ownerBalanceAfter = await token.balanceOf(owner)
      const poolBalanceAfter = await token.balanceOf(pool.address)

      expect(ownerBalanceAfter).to.be.bignumber.equal(
        ownerBalanceBefore.add(ONE_TOKEN)
      )
      expect(poolBalanceAfter).to.be.bignumber.equal(
        poolBalanceBefore.sub(ONE_TOKEN)
      )
    })

    it('substracts the funds to the owner funds inside the pool', async () => {
      const ownerBalanceBefore = await pool.ownerFunds()
      await pool.withdrawOwnerFunds(ONE_TOKEN, { from: owner })
      const ownerBalanceAfter = await pool.ownerFunds()

      expect(ownerBalanceAfter).to.be.bignumber.equal(
        ownerBalanceBefore.sub(ONE_TOKEN)
      )
    })
  })
}

/*
ownerFunds > minOwnerFunds + 1

if (ownerFunds - amount) < minOwnerFunds)
    amount = ownerFunds - minOwnerFunds
*/

module.exports = {
  itCorrectlyAddsOwnerFunds,
  itCorrectlyWithdrawsOwnerFunds,
  itSetsPoolDefinition,
}
