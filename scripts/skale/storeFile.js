#!/usr/bin/env node

const Filestorage = require('@skalenetwork/filestorage.js/src/index')

const { account, getWeb3Provider } = require('./config')

const stringToArrayBuffer = string => {
  const buffer = new ArrayBuffer(string.length * 2)
  const bufferView = new Uint16Array(buffer)

  for (let i = 0, stringLen = string.length; i < stringLen; i++) {
    bufferView[i] = string.charCodeAt(i)
  }

  return buffer
}

const exec = async () => {
  const web3Provider = getWeb3Provider(false)
  const fileStorage = new Filestorage(web3Provider, true)

  const fileName = 'testFileName1'
  const fileBuffer = Buffer.from(stringToArrayBuffer('Hello World'))

  // const filestorage = new FilestorageClient('http://104.248.79.40:8057', true)
  const formattedPrivateKey = '0x' + process.env.KEY

  try {
    const storedFilePath = await fileStorage.uploadFile(
      account,
      fileName,
      fileBuffer,
      formattedPrivateKey
    )

    console.log({ storedFilePath })
  } catch (error) {
    console.log({ error })
  }
}

exec()
