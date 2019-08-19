/*
SKALE Chain ID: UPPC7EI4
SKALE Chain Proxy (ABIs): http://bit.ly/2Xl3Iqh
SKALE Private Net Proxy (ABIs): http://bit.ly/2XlRUo3
SKALE Private Net Endpoint: http://134.209.56.46:1919


Chain ID 2: '1KYUQ531'
SKALE Private Net Endpoint 2: http://165.22.133.157:10101
*/

const Tx = require('ethereumjs-tx')
const Web3 = require('web3')

const schainEndpointMain = 'http://134.209.56.46:1919'
const schainEndpointSide = 'http://104.248.79.40:8057'
const schainEndpointSide2 = 'http://165.22.133.157:10101'

const getEndpoint = isMain => (isMain ? schainEndpointMain : schainEndpointSide)
const getEndpoint2 = isMain =>
  isMain ? schainEndpointMain : schainEndpointSide2

const getWeb3Provider = isMain =>
  new Web3.providers.HttpProvider(getEndpoint(isMain))

const getWeb3Provider2 = isMain =>
  new Web3.providers.HttpProvider(getEndpoint2(isMain))

const getWeb3 = isMain => new Web3(getWeb3Provider(isMain))
const getWeb3_2 = isMain => new Web3(getWeb3Provider2(isMain))

const getLocalWeb3 = () =>
  new Web3(new Web3.providers.HttpProvider('http://localhost:7545'))

const privateKey = Buffer.from(process.env.KEY, 'hex')

// const account = '0x15ae150d7dC03d3B635EE90b85219dBFe071ED35'
const account = '0x627306090abaB3A6e1400e9345bC60c78a8BEf57'

const privateTestnetJson = require('../../contracts/private_skale_testnet_proxy.json')
const schainJson = require('../../contracts/schain_proxy.json')
const schainID = 'UPPC7EI4'
const schainID2 = '1KYUQ531'

module.exports = {
  account,
  getLocalWeb3,
  getWeb3,
  getWeb3_2,
  getWeb3Provider,
  getWeb3Provider2,
  privateKey,
  privateTestnetJson,
  schainID,
  schainID2,
  schainJson,
  Tx,
}
