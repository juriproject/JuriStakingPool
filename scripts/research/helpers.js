const Tx = require('ethereumjs-tx')

const sendTx = async ({ data, from, nonce, privateKey, value, to, web3 }) => {
  const rawTx = {
    data,
    from,
    nonce: nonce || (await web3.eth.getTransactionCount(from)),
    to,
    gasPrice: 0,
    gas: 8000000,
    value: value || 0x0,
  }

  const tx = new Tx(rawTx)
  tx.sign(privateKey)

  const serializedTx = tx.serialize()

  return web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
}

const overwriteLog = msg => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(msg)
}

module.exports = { sendTx, overwriteLog }
