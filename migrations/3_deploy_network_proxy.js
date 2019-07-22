const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriNetworkProxy = artifacts.require('./JuriNetworkProxy.sol')
const MaxHeapLibrary = artifacts.require('./MaxHeapLibrary.sol')
const SkaleFileStorageMock = artifacts.require('./SkaleFileStorageMock.sol')

const ONE_HOUR = 60 * 60
const ONE_WEEK = ONE_HOUR * 24 * 7

module.exports = deployer => {
  deployer.then(async () => {
    await deployer.deploy(MaxHeapLibrary)
    await deployer.link(MaxHeapLibrary, [JuriNetworkProxy])

    const skaleFileStorage = await deployer.deploy(ERC20Mintable)
    const token = await deployer.deploy(SkaleFileStorageMock)

    await deployer.deploy(
      JuriNetworkProxy,
      token.address,
      skaleFileStorage.address,
      ONE_WEEK,
      ONE_HOUR,
      ONE_HOUR,
      ONE_HOUR,
      ONE_HOUR,
      ONE_HOUR,
      ONE_HOUR,
      '10000000000000000000',
      10,
      20,
      40,
      40
    )
  })
}
