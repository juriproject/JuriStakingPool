const { ether, time } = require('openzeppelin-test-helpers')
const Web3Utils = require('web3-utils')

const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriBonding = artifacts.require('./JuriBonding.sol')
const JuriNetworkProxy = artifacts.require('./JuriNetworkProxy.sol')
const SkaleFileStorageMock = artifacts.require('./SkaleFileStorageMock.sol')

const itRunsProxyRoundCorrectly = async addresses => {
  describe('when running a round', async () => {
    let bonding, proxy, token

    beforeEach(async () => {
      skaleFileStorage = await SkaleFileStorageMock.new()
      token = await ERC20Mintable.new()
      proxy = await JuriNetworkProxy.new(
        token.address,
        skaleFileStorage.address,
        duration.days(7),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        ether('1000'),
        10,
        20,
        40,
        40
      )
      bonding = await JuriBonding.at(await networkProxy.bonding())
    })

    it('runs the round correctly', async () => {})
  })
}

module.exports = itRunsProxyRoundCorrectly
