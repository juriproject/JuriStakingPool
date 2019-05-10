const { expect } = require('chai')
const { BN } = require('openzeppelin-test-helpers')

const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')

const removeUsers = async ({ pool, usersToRemove }) => {
  for (let i = 0; i < usersToRemove.length; i++) {
    await pool.removeUserInNextPeriod({ from: usersToRemove[i] })
  }
}

const itComputesCorrectRemovalIndices = async addresses => {
  describe('when computing removal indices', async () => {
    let pool, poolUsers, poolStakes, token, usersToRemove

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({ addresses })

      token = deployedContracts.token
      pool = deployedContracts.pool

      poolUsers = addresses.slice(1, addresses.length) // without owner
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))

      await initialPoolSetup({
        pool,
        poolUsers,
        poolStakes,
        token,
      })
    })

    describe('when given a single user to remove', async () => {
      beforeEach(async () => {
        usersToRemove = [poolUsers[0]]
        await removeUsers({ pool, usersToRemove })
      })

      it.only('computes the correct removal indices', async () => {
        const removalIndices = await pool.getRemovalIndicesInUserList()

        expect(removalIndices[0]).to.be.bignumber.equal(new BN(0))
      })
    })

    describe('when given a multiple users to remove', async () => {
      beforeEach(async () => {
        if (poolUsers.length > 1) {
          usersToRemove = [poolUsers[1], poolUsers[2]]
          await removeUsers({ pool, usersToRemove })
        }
      })

      it('computes the correct removal indices', async () => {
        if (poolUsers.length > 1) {
          const removalIndices = await pool.getRemovalIndicesInUserList()

          expect(removalIndices[0]).to.be.bignumber.equal(new BN(1))
          expect(removalIndices[1]).to.be.bignumber.equal(new BN(2))
        }
      })
    })

    describe('when given all users to remove', async () => {
      beforeEach(async () => {
        if (poolUsers.length > 1) {
          usersToRemove = poolUsers
          await removeUsers({ pool, usersToRemove })
        }
      })

      it('computes the correct removal indices', async () => {
        if (poolUsers.length > 1) {
          const removalIndices = await pool.getRemovalIndicesInUserList()

          for (let i = 0; i < poolUsers.length; i++) {
            expect(removalIndices[i]).to.be.bignumber.equal(new BN(i))
          }
        }
      })
    })
  })
}

module.exports = itComputesCorrectRemovalIndices
