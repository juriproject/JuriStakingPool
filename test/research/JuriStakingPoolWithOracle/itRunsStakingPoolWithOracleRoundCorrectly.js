const { expect } = require('chai')
const { BN, ether, time } = require('openzeppelin-test-helpers')

const {
  deployJuriStakingPool,
  initialPoolSetup,
  runPoolRound,
} = require('../helpers/RoundHelpers')

const { logPoolState } = require('../../JuriStakingPool/helpers')

const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriBonding = artifacts.require('./JuriBonding.sol')
const JuriNetworkProxyMock = artifacts.require('./JuriNetworkProxyMock.sol')

const { duration } = time

const itRunsStakingPoolWithOracleRoundCorrectly = async addresses => {
  describe('when running a round', async () => {
    let bonding,
      compliantGainPercentage,
      juriFeesToken,
      juriToken,
      maxNonCompliantPenaltyPercentage,
      proxyMock

    beforeEach(async () => {
      poolUsers = addresses.slice(0, 4)
      poolStakes = new Array(poolUsers.length).fill(new BN(1000))
      juriFoundation = addresses[4]

      juriFeesToken = await ERC20Mintable.new()
      juriToken = await ERC20Mintable.new()
      proxyMock = await JuriNetworkProxyMock.new(
        juriFeesToken.address,
        juriToken.address,
        juriFoundation,
        ether('1000'),
        10,
        20,
        40,
        40
      )
      bonding = await JuriBonding.at(await proxyMock.bonding())

      await Promise.all(
        addresses
          .slice(0, 10)
          .map(address => juriToken.mint(address, ether('1000000')))
      )
      await Promise.all(
        addresses
          .slice(1, 5)
          .map(node =>
            juriToken
              .approve(bonding.address, ether('10000'), { from: node })
              .then(() => bonding.bondStake(ether('10000'), { from: node }))
          )
      )

      compliantGainPercentage = new BN(4)
      maxNonCompliantPenaltyPercentage = new BN(5)

      const deployedContracts = await deployJuriStakingPool({
        addresses,
        networkProxy: proxyMock,
        periodLength: duration.days(7),
        feePercentage: 1,
        compliantGainPercentage: 4,
        maxNonCompliantPenaltyPercentage: 5,
        minStakePerUser: 10,
        maxStakePerUser: 100000,
        maxTotalStake: 10000000,
        juriAddress: addresses[0],
      })

      pool = deployedContracts.pool
      daiToken = deployedContracts.token

      await initialPoolSetup({
        pool,
        poolStakes,
        poolUsers,
        token: daiToken,
      })
    })

    it('runs the round correctly', async () => {
      await logPoolState(pool)

      const complianceData1 = [3, -3, 2, 1]
      const complianceData2 = [-3, 2, 3, -1]

      await runPoolRound({
        complianceData: complianceData1,
        pool,
        proxyMock,
        poolUsers,
      })

      for (let i = 0; i < poolUsers.length; i++) {
        const balance = await pool.getStakeForUserInCurrentPeriod(poolUsers[i])
        const expectedBalance =
          complianceData1[i] > 0
            ? poolStakes[i].add(
                poolStakes[i].mul(compliantGainPercentage).div(new BN(100))
              )
            : poolStakes[i].sub(
                poolStakes[i]
                  .mul(maxNonCompliantPenaltyPercentage)
                  .div(new BN(100))
              )

        expect(balance).to.be.bignumber.equal(expectedBalance)
      }

      await runPoolRound({
        complianceData: complianceData2,
        pool,
        proxyMock,
        poolUsers,
      })

      for (let i = 0; i < poolUsers.length; i++) {
        const balance = await pool.getStakeForUserInCurrentPeriod(poolUsers[i])
        const balanceBefore =
          complianceData1[i] > 0
            ? poolStakes[i].add(
                poolStakes[i].mul(compliantGainPercentage).div(new BN(100))
              )
            : poolStakes[i].sub(
                poolStakes[i]
                  .mul(maxNonCompliantPenaltyPercentage)
                  .div(new BN(100))
              )

        const expectedBalance =
          complianceData2[i] > 0
            ? balanceBefore.add(
                balanceBefore.mul(compliantGainPercentage).div(new BN(100))
              )
            : balanceBefore.sub(
                balanceBefore
                  .mul(maxNonCompliantPenaltyPercentage)
                  .div(new BN(100))
              )

        expect(balance).to.be.bignumber.equal(expectedBalance)
      }
    })
  })
}

module.exports = itRunsStakingPoolWithOracleRoundCorrectly
