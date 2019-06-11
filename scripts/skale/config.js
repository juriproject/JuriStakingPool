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

const getWeb3 = isMain =>
  new Web3(new Web3.providers.HttpProvider(getEndpoint(isMain)))

let privateKey = Buffer.from(process.env.KEY, 'hex')
let account = '0x15ae150d7dC03d3B635EE90b85219dBFe071ED35'

module.exports = { account, getWeb3, privateKey, Tx }
