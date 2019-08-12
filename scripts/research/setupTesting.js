const {
  account,
  Ether1e17,
  fileStorage,
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  networkProxyAddress,
  NetworkProxyContract,
  oneEther,
  privateKey,
  web3,
} = require('./config')

const { sendTx, overwriteLog } = require('./helpers')

const runSetup = async ({
  accounts,
  bondingAddress,
  BondingContract,
  juriTokenAddress,
  JuriTokenContract,
  originalAccount,
  originalPrivateKey,
  web3,
}) => {
  const nonceOriginalAccount1 = await web3.eth.getTransactionCount(
    originalAccount
  )

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]

    overwriteLog(`Send 0.1 Eth to account ${i}...`)

    await sendTx({
      data: 0x0,
      from: originalAccount,
      nonce: nonceOriginalAccount1 + i,
      to: account.address,
      privateKey: originalPrivateKey,
      value: Ether1e17,
      web3,
    })
  }

  overwriteLog(`Sending Ether to accounts finished!`)
  process.stdout.write('\n')

  const nonceOriginalAccount2 = await web3.eth.getTransactionCount(
    originalAccount
  )

  for (let i = 4; i < accounts.length; i++) {
    const account = accounts[i]

    overwriteLog(`Mint one token to account ${i}...`)

    await sendTx({
      data: JuriTokenContract.methods
        .mint(account.address, oneEther.toString())
        .encodeABI(),
      from: originalAccount,
      nonce: nonceOriginalAccount2 + i - 4,
      to: juriTokenAddress,
      privateKey: originalPrivateKey,
      web3,
    })

    overwriteLog(`Approve one token from account ${i}...`)

    await sendTx({
      data: JuriTokenContract.methods
        .approve(bondingAddress, oneEther.toString())
        .encodeABI(),
      from: account.address,
      to: juriTokenAddress,
      privateKey: account.privateKeyBuffer,
      web3,
    })

    overwriteLog(`Bond one token for account ${i}...`)

    await sendTx({
      data: BondingContract.methods.bondStake(oneEther.toString()).encodeABI(),
      from: account.address,
      to: bondingAddress,
      privateKey: account.privateKeyBuffer,
      web3,
    })
  }

  overwriteLog(`Bonding tokens finished!`)
  process.stdout.write('\n')
}

const addUserHeartRateFiles = async ({
  NetworkProxyContract,
  networkProxyAddress,
  originalAccount,
  originalPrivateKey,
  users,
  web3,
}) => {
  overwriteLog('Moving to users adding heart rate data stage...')
  await sendTx({
    data: NetworkProxyContract.methods
      .moveToUserAddingHeartRateDataStage()
      .encodeABI(),
    from: originalAccount,
    to: networkProxyAddress,
    privateKey: originalPrivateKey,
    web3,
  })
  overwriteLog(`Moved to users adding heart rate data stage!`)
  process.stdout.write('\n')

  const fileStoragePaths = []

  for (let i = 0; i < users.length; i++) {
    overwriteLog(`Upload heart rate file for user ${i}...`)

    const user = users[i]
    const fileName = `userHeartrateDataTest-${i}`
    const fileBuffer = Buffer.from(`Hello World-${i}`)

    const storedFilePath = await fileStorage.uploadFile(
      user.address,
      fileName,
      fileBuffer,
      user.privateKey
    )

    const modifiedFilePath = storedFilePath.replace('\\', '/')
    fileStoragePaths.push(modifiedFilePath)

    /* const status = (await new FilestorageContract(web3).getFileStatus(
      modifiedFilePath
    )).toString()
    console.log({ modifiedFilePath, status }) */

    const userWorkoutSignature =
      '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100'

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

const exec = async () => {
  const originalAccount = account
  const originalPrivateKey = privateKey

  const bondingAddress = await getBondingAddress()
  const BondingContract = await getBondingContract()
  const juriFeesTokenAdress = await getJuriFeesTokenAddress()
  const JuriFeesTokenContract = await getJuriFeesTokenContract()
  const juriTokenAddress = await getJuriTokenAddress()
  const JuriTokenContract = await getJuriTokenContract()

  const accounts = new Array(10)
    .fill(0)
    .map((_, i) => web3.eth.accounts.create(`${Date.now().toString()}${i}`))
    .map(account => ({
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

  await runSetup({
    accounts,
    bondingAddress,
    BondingContract,
    juriTokenAddress,
    JuriTokenContract,
    originalAccount,
    originalPrivateKey,
    web3,
  })

  const fileStoragePaths = await addUserHeartRateFiles({
    NetworkProxyContract,
    networkProxyAddress,
    originalAccount,
    originalPrivateKey,
    users,
    web3,
  })

  console.log({ fileStoragePaths })
}

exec()
