const assert = require('assert')
const HDWalletProvider = require('truffle-hdwallet-provider')

const DEFAULT_GAS_PRICE_GWEI = 5
const DEFAULT_MNEMONIC =
  'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
const GAS_LIMIT = 6.5e6

function truffleConfig({
  mnemonic = DEFAULT_MNEMONIC,
  gasPriceGWei = DEFAULT_GAS_PRICE_GWEI,
  gas = GAS_LIMIT,
  optimizedEnabled = false,
  urlRinkeby = 'https://rinkeby.infura.io/',
  urlMainnet = 'https://mainnet.infura.io',
  urlDevelopment = 'localhost',
  portDevelopment = 8545,
} = {}) {
  assert(mnemonic, 'The mnemonic has not been provided')

  console.log('')
  console.log(`Using gas limit: ${gas / 1000} K`)
  console.log(`Using gas price: ${gasPriceGWei} Gwei`)
  console.log(`Optimizer enabled: ${optimizedEnabled}`)
  console.log('Using default mnemonic: %s', mnemonic === DEFAULT_MNEMONIC)
  console.log('')

  const gasPrice = gasPriceGWei * 1e9
  const _getProvider = url => () => new HDWalletProvider({ mnemonic, url })

  return {
    networks: {
      development: {
        host: urlDevelopment,
        port: portDevelopment,
        gas,
        gasPrice,
        network_id: '*',
      },
      mainnet: {
        provider: _getProvider(urlMainnet),
        network_id: '1',
        gas,
        gasPrice,
      },
      rinkeby: {
        provider: _getProvider(urlRinkeby),
        network_id: '4',
        gas,
        gasPrice,
      },
    },
    solc: {
      optimizer: {
        enabled: optimizedEnabled,
      },
    },
    compilers: {
      solc: {
        version: '0.5.8',
      },
    },
  }
}

module.exports = truffleConfig({
  optimizedEnabled: true,
})
