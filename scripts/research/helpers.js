const Tx = require('ethereumjs-tx')

const {
  account,
  fileStorage,
  networkProxyAddress,
  NetworkProxyContract,
  privateKey,
  users,
  web3,
} = require('./config')

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

const addUserHeartRateFiles = async maxUserCount => {
  overwriteLog('Moving to users adding heart rate data stage...')
  await sendTx({
    data: NetworkProxyContract.methods
      .moveToUserAddingHeartRateDataStage()
      .encodeABI(),
    from: account,
    to: networkProxyAddress,
    privateKey,
    web3,
  })
  overwriteLog(`Moved to users adding heart rate data stage!`)
  process.stdout.write('\n')

  const fileStoragePaths = []
  const userCount = maxUserCount || users.length

  for (let i = 0; i < userCount; i++) {
    overwriteLog(`Upload heart rate file for user ${i}...`)

    const user = users[i]
    const fileName = `userHeartrateDataTest-${Date.now()}`
    const fileBuffer = Buffer.from(`Hello World-${i}`)

    const storedFilePath = await fileStorage.uploadFile(
      user.address,
      fileName,
      fileBuffer,
      user.privateKey
    )
    // const storedFilePath = `${user.address.slice(2)}\\${fileName}`

    const modifiedFilePath = storedFilePath.replace('\\', '/')
    fileStoragePaths.push(modifiedFilePath)

    /* const status = (await new FilestorageContract(web3).getFileStatus(
      modifiedFilePath
    )).toString()
    console.log({ modifiedFilePath, status }) */

    const userWorkoutSignature = (
      '0x' +
      i +
      '000000000000000000000000000000f726c6448656c6c6f576f726c642100'
    ).slice(0, 64)

    await sendTx({
      data: NetworkProxyContract.methods
        .addHeartRateDateForPoolUser(userWorkoutSignature, modifiedFilePath)
        .encodeABI(),
      from: user.address,
      to: networkProxyAddress,
      privateKey: user.privateKeyBuffer,
      web3,
    })
  }

  overwriteLog(`Heart rate files uploaded!`)
  process.stdout.write('\n')

  return fileStoragePaths
}

const filterAsync = (array, filter) =>
  Promise.all(array.map(entry => filter(entry))).then(bits =>
    array.filter(() => bits.shift())
  )

const sleep = require('util').promisify(setTimeout)

const parseRevertMessage = error =>
  JSON.parse(error.slice(error.indexOf('reverted by the EVM') + 20))
    .revertReason

module.exports = {
  addUserHeartRateFiles,
  filterAsync,
  parseRevertMessage,
  sendTx,
  sleep,
  overwriteLog,
}
