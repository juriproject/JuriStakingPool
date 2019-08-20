const {
  account,
  Ether1e17,
  getBondingAddress,
  getBondingContract,
  getJuriFeesTokenAddress,
  getJuriFeesTokenContract,
  getJuriTokenAddress,
  getJuriTokenContract,
  networkProxyAddress,
  NetworkProxyContract,
  nodes,
  oneEther,
  privateKey,
  users,
  web3,
} = require('./config')

const { addUserHeartRateFiles, sendTx, overwriteLog } = require('./helpers')

const { BN } = web3.utils

const runSetup = async ({
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

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    overwriteLog(`Send 0.1 Eth to node ${i}...`)

    await sendTx({
      data: 0x0,
      from: originalAccount,
      nonce: nonceOriginalAccount1 + i,
      to: node.address,
      privateKey: originalPrivateKey,
      value: Ether1e17,
      web3,
    })
  }

  overwriteLog(`Sending Ether to nodes finished!`)
  process.stdout.write('\n')

  const nonceOriginalAccount2 = await web3.eth.getTransactionCount(
    originalAccount
  )

  for (let i = 0; i < users.length; i++) {
    const user = users[i]

    overwriteLog(`Send 0.1 Eth to user ${i}...`)

    await sendTx({
      data: 0x0,
      from: originalAccount,
      nonce: nonceOriginalAccount2 + i,
      to: user.address,
      privateKey: originalPrivateKey,
      value: Ether1e17,
      web3,
    })
  }

  overwriteLog(`Sending Ether to users finished!`)
  process.stdout.write('\n')

  const nonceOriginalAccount3 = await web3.eth.getTransactionCount(
    originalAccount
  )

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    overwriteLog(`   Mint 10,000 tokens to node ${i}...`)

    const tenThousandEther = oneEther.mul(new BN(10000))

    await sendTx({
      data: JuriTokenContract.methods
        .mint(node.address, tenThousandEther.toString())
        .encodeABI(),
      from: originalAccount,
      nonce: nonceOriginalAccount3 + i,
      to: juriTokenAddress,
      privateKey: originalPrivateKey,
      web3,
    })

    overwriteLog(`Approve 10,000 token from node ${i}...`)

    await sendTx({
      data: JuriTokenContract.methods
        .approve(bondingAddress, tenThousandEther.toString())
        .encodeABI(),
      from: node.address,
      to: juriTokenAddress,
      privateKey: node.privateKeyBuffer,
      web3,
    })

    overwriteLog(`   Bond 10,000 token for node ${i}...`)

    await sendTx({
      data: BondingContract.methods
        .bondStake(tenThousandEther.toString())
        .encodeABI(),
      from: node.address,
      to: bondingAddress,
      privateKey: node.privateKeyBuffer,
      web3,
    })
  }

  overwriteLog(`Bonding tokens finished!`)
  process.stdout.write('\n')

  overwriteLog('Moving to next round...')
  await sendTx({
    data: NetworkProxyContract.methods.debugIncreaseRoundIndex().encodeABI(),
    from: originalAccount,
    to: networkProxyAddress,
    privateKey: originalPrivateKey,
    web3,
  })
  overwriteLog(`Moved to next round!`)
  process.stdout.write('\n')
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

  /* const accounts = new Array(14)
    .fill(0)
    .map((_, i) => web3.eth.accounts.create(`${Date.now().toString()}${i}`))
    .map(({ address, privateKey }) => ({ address, privateKey })) */

  await runSetup({
    bondingAddress,
    BondingContract,
    juriTokenAddress,
    JuriTokenContract,
    originalAccount,
    originalPrivateKey,
    web3,
  })

  /* const fileStoragePaths = await addUserHeartRateFiles({
    NetworkProxyContract,
    networkProxyAddress,
    originalAccount,
    originalPrivateKey,
    web3,
  }) */

  // console.log({ fileStoragePaths })
}

exec()
