const Filestorage = require('@skalenetwork/filestorage.js/src/index')
const FilestorageContract = require('@skalenetwork/filestorage.js/src/FilestorageContract')

const {
  account,
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

const networkProxyAddress = '0xABBc4415Df411202711ec344acD7C67E3B4f2c52'

const web3 = getWeb3(false)
const fileStorage = new Filestorage(getWeb3Provider(false), false)
const BN = web3.utils.BN

const oneEther = new BN('1000000000000000000')
const Ether1e17 = new BN('100000000000000000')

const NetworkProxyContract = new web3.eth.Contract(
  NetworkProxyAbi,
  networkProxyAddress
)

let bondingAdress, juriTokenAddress, juriFeesTokenAddress

const getBondingAddress = async () => {
  if (bondingAdress) return bondingAdress

  bondingAdress = await NetworkProxyContract.methods.bonding().call()
  return bondingAdress
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
  oneEther,
  PoolAbi,
  privateKey,
  web3,
}
