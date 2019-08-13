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

const networkProxyAddress = '0xFA206c0d5d96ED2FCb993808cf5b4c7a7F21E78D'

const web3 = getWeb3(false)
const fileStorage = new Filestorage(getWeb3Provider(false), false)
const { BN } = web3.utils

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

const nodes = [
  {
    address: '0x609090313b64c65e968162288E619c39D03a69c6',
    privateKey:
      '0xbb5652eb50c53cb1c945b9739430c30fd299343781b1b8b99cb83e2ee5b32783',
  },
  {
    address: '0xDa12C700772F053B5a57CcF403339AA89c060926',
    privateKey:
      '0x194ea715a81f524230b8ff0c373926fd48fabf6030beb9e87ff6d34d8ab9ec86',
  },
  {
    address: '0xCb7B84Dc118D6842248B10a966ce5e62364c2B3F',
    privateKey:
      '0x92fb8c3a5d4fe75d12e3942551d211af1c4143bcdd76971632cb284a2a6b4f34',
  },
  {
    address: '0x69a2A1F51c593295244C5eDa90378Bed74094583',
    privateKey:
      '0x963d056e0d820a47ead9a2c6eca6605104c5414cbe840b8cd4c5024ec8214ba2',
  },
  {
    address: '0x886D615D50789ee2CCc3De7F90b58072C538192d',
    privateKey:
      '0xe5013e07f864fd94dc14a2f3e3a9999eb992ab3354a8c14ed12a419afdad0b36',
  },
  {
    address: '0x2c82aFaB0141e519B1250Be99c76A795b31cCc39',
    privateKey:
      '0x74c3a74492aaee16ffecdd36f1647f72852551b03fe1c5d9e363c657626e4e5f',
  },
].map(account => ({
  ...account,
  privateKeyBuffer: Buffer.from(account.privateKey.slice(2), 'hex'),
}))

const users = [
  {
    address: '0x7E0c6B2bE8010CcaB4F3C93CD34CD60E6582b21f',
    privateKey:
      '0x2b04d43db539e9d42a78be6beae048cb9dd3ce82b8047f93ff5d3e5ba6d13986',
  },
  {
    address: '0x411fcF9AaB9F516cEaD0e6826A57775E23f19f5a',
    privateKey:
      '0x7704dde5b64556612ffaf3cb6d5c454848791859e4fe50918c9bbbf39cc6b5e3',
  },
  {
    address: '0xE3a58b4778E5B171249031c3b4defa6e8f58722c',
    privateKey:
      '0xad88ec1134b9f6f4c4a6d6c579af4bc039e6a857f3544972b8c80afcb4a9db54',
  },
  {
    address: '0x26dd0efBa29886B71bDa2117C205aA6db2501973',
    privateKey:
      '0xed9d5de8d30022187ac4aabe89dacc1f3625b4e91dd41ba24b18fa0e34b98f20',
  },
  {
    address: '0xab7F39f99d7aECc2E1516bd0c20c1204C21a0FfD',
    privateKey:
      '0x18346dcefaad7031ca2dcc6b711232fa7127c33ab48e25869d17e22f2aa5c262',
  },
  {
    address: '0x4eD79fa3348fEE0ffa3B0213B701daC561F364DA',
    privateKey:
      '0xf042fe76ab3d31f88268f87f01c86d4550398a5ccfa8944df0a325a15197550e',
  },
].map(account => ({
  ...account,
  privateKeyBuffer: Buffer.from(account.privateKey.slice(2), 'hex'),
}))

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
}
