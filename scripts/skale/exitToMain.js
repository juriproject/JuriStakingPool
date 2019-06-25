#!/usr/bin/env node

const { account, getWeb3, privateKey, Tx } = require('./config')

const schainJson = require('../../contracts/schain_proxy.json')

const exec = async () => {
  const web3 = getWeb3(false)
  const tokenManagerAddress = schainJson.token_manager_address
  const ABI = schainJson.token_manager_abi

  const contract = new web3.eth.Contract(ABI, tokenManagerAddress)

  const exitToMain = contract.methods
    .exitToMain(account, web3.utils.fromAscii('TEST MESSAGE: HELLO WORLD!'))
    .encodeABI()

  const rawTx = {
    nonce: await web3.eth.getTransactionCount(account),
    from: account,
    data: exitToMain,
    to: tokenManagerAddress,
    gasPrice: 0,
    gas: 8000000,
    value: web3.utils.toHex(web3.utils.toWei('1', 'ether')),
  }

  const tx = new Tx(rawTx)
  tx.sign(privateKey)

  const serializedTx = tx.serialize()

  const result = await web3.eth.sendSignedTransaction(
    '0x' + serializedTx.toString('hex')
  )
  console.log({ result })
}

exec()