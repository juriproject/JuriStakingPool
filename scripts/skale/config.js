/*
SKALE Chain ID: UPPC7EI4
SKALE Chain Proxy (ABIs): http://bit.ly/2Xl3Iqh
SKALE Private Net Proxy (ABIs): http://bit.ly/2XlRUo3
SKALE Private Net Endpoint: http://134.209.56.46:1919
*/

// const deployedJuriPoolAddress = '0x86ae91a1a3CbAF8cAD5f9bc0b6097d2b3a836028'

const Tx = require('ethereumjs-tx')
const Web3 = require('web3')

const schainEndpointMain = 'http://134.209.56.46:1919'
const schainEndpointSide = 'http://104.248.79.40:8057'

const getEndpoint = isMain => (isMain ? schainEndpointMain : schainEndpointSide)

const getWeb3Provider = isMain =>
  new Web3.providers.HttpProvider(getEndpoint(isMain))

const getWeb3 = isMain => new Web3(getWeb3Provider(isMain))

const privateKey = Buffer.from(process.env.KEY, 'hex')
const account = '0x15ae150d7dC03d3B635EE90b85219dBFe071ED35'

const privateTestnetJson = require('../../contracts/private_skale_testnet_proxy.json')
const schainJson = require('../../contracts/schain_proxy.json')
const schainID = 'UPPC7EI4'

module.exports = {
  account,
  getWeb3,
  getWeb3Provider,
  privateKey,
  privateTestnetJson,
  schainID,
  schainJson,
  Tx,
}
