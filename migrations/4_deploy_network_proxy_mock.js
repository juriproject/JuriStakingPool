const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriNetworkProxyMock = artifacts.require('./JuriNetworkProxyMock.sol')
const MaxHeapLibrary = artifacts.require('./MaxHeapLibrary.sol')

module.exports = deployer => {
  deployer.then(async () => {
    await deployer.deploy(MaxHeapLibrary)
    await deployer.link(MaxHeapLibrary, [JuriNetworkProxyMock])

    const juriToken = await deployer.deploy(ERC20Mintable)
    const juriFeesToken = await deployer.deploy(ERC20Mintable)

    await deployer.deploy(
      JuriNetworkProxyMock,
      juriFeesToken.address,
      juriToken.address,
      '10000000000000000000',
      10,
      20,
      40,
      40
    )
  })
}
