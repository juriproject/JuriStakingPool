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

    const skaleFileStorage = await deployer.deploy(SkaleFileStorageMock)
    const juriToken = await deployer.deploy(ERC20Mintable)
    const juriFeesToken = await deployer.deploy(ERC20Mintable)
    const juriFoundation = '0x15ae150d7dc03d3b635ee90b85219dbfe071ed35'

    await deployer.deploy(
      JuriNetworkProxy,
      juriFeesToken.address,
      juriToken.address,
      juriFoundation,
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
