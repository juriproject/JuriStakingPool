const { BN, shouldFail } = require('openzeppelin-test-helpers')

const { deployJuriStakingPool, initialPoolSetup } = require('./helpers')

const itChecksContraintsOnOptingInOutOfStaking = async addresses => {
  let pool, poolUsers, poolStakes, token

  describe('when opting in', async () => {
    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses,
      })

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

    describe('when called by a non-existant pool user', async () => {
      it('reverts the transacion', async () => {
        const owner = addresses[0]

        await shouldFail.reverting.withMessage(
          pool.withdraw(100, { from: owner }),
          'Only added pool users can use this function!'
        )
      })
    })
  })
}

module.exports = itChecksContraintsOnOptingInOutOfStaking
