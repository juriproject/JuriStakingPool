const Filestorage = require('@skalenetwork/filestorage.js/src/index')
const FilestorageContract = require('@skalenetwork/filestorage.js/src/FilestorageContract')

const {
  account,
  getLocalWeb3,
  getWeb3,
  getWeb3Provider,
  privateKey,
} = require('../skale/config')

const BondingAbi = require('../../build/contracts/JuriBonding').abi
const ERC20MintableAbi = require('../../build/contracts/ERC20Mintable').abi
const JuriStakingPoolWithOracleMockAbi = require('../../build/contracts/JuriStakingPoolWithOracleMock')
  .abi
const JuriTokenAbi = require('../../build/contracts/JuriTokenMock').abi
const NetworkProxyAbi = require('../../build/contracts/JuriNetworkProxy').abi
const PoolAbi = require('../../build/contracts/JuriStakingPoolWithOracle').abi

const { nodes, users } = require('./accounts')

// const web3 = getWeb3(false)
// const networkProxyAddress = '0x87558be0F69CDbF662b859EE251C0C455De14154'

const web3 = getLocalWeb3()
const networkProxyAddress = '0xf204a4Ef082f5c04bB89F7D5E6568B796096735a'

const fileStorage = new Filestorage(getWeb3Provider(false), false)
const { BN } = web3.utils

const oneEther = new BN('1000000000000000000')
const Ether1e17 = new BN('100000000000000000')

const NetworkProxyContract = new web3.eth.Contract(
  NetworkProxyAbi,
  networkProxyAddress
)

let bondingAddress, juriTokenAddress, juriFeesTokenAddress

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const getBondingAddress = async () => {
  if (bondingAddress) return bondingAddress
  bondingAddress = await NetworkProxyContract.methods.bonding().call()

  return bondingAddress
}
const getBondingContract = async () =>
  new web3.eth.Contract(BondingAbi, await getBondingAddress())

const getJuriTokenAddress = async () => {
  if (juriTokenAddress) return juriTokenAddress

  const BondingContract = await getBondingContract()
  juriTokenAddress = await BondingContract.methods.token().call()

  return juriTokenAddress
}

const getJuriTokenContract = async () =>
  new web3.eth.Contract(JuriTokenAbi, await getJuriTokenAddress())

const getJuriFeesTokenAddress = async () => {
  if (juriFeesTokenAddress) return juriFeesTokenAddress

  juriFeesTokenAddress = await NetworkProxyContract.methods
    .juriFeesToken()
    .call()
  return juriFeesTokenAddress
}

const getJuriFeesTokenContract = async () =>
  new web3.eth.Contract(ERC20MintableAbi, await getJuriFeesTokenAddress())

module.exports = {
  account,
  Ether1e17,
  fileStorage,
  FilestorageContract,
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  JuriStakingPoolWithOracleMockAbi,
  networkProxyAddress,
  NetworkProxyContract,
  nodes,
  oneEther,
  PoolAbi,
  privateKey,
  users,
  web3,
  ZERO_ADDRESS,
}
