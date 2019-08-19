const erc20PrivateTestnetJson = require('../../contracts/schain_erc20_abis.json')

const { account, getWeb3_2, privateKey, schainJson, Tx } = require('./config')

const accountForMainnet = account
const accountForSchain = account

const tokenManagerAddress = schainJson.token_manager_address
const tokenManagerABI = schainJson.token_manager_abi

const erc20ABI = erc20PrivateTestnetJson.eth_erc20_abi
const erc20Address = erc20PrivateTestnetJson.eth_erc20_address

const web3ForSchain = getWeb3_2(true)

const exec = async () => {
  const tokenManager = new web3ForSchain.eth.Contract(
    tokenManagerABI,
    tokenManagerAddress
  )

  const contractERC20 = new web3ForSchain.eth.Contract(erc20ABI, erc20Address)

  const approve = contractERC20.methods
    .approve(
      tokenManagerAddress,
      web3ForSchain.utils.toHex(web3ForSchain.utils.toWei('1', 'ether'))
    )
    .encodeABI()

  const deposit = tokenManager.methods
    .exitToMainERC20(
      erc20Address,
      accountForMainnet,
      web3ForSchain.utils.toHex(web3ForSchain.utils.toWei('1', 'ether'))
    )
    .encodeABI()

  let nonce = await web3ForSchain.eth.getTransactionCount(accountForSchain)
  const rawTxApprove = {
    from: accountForSchain,
    nonce: '0x' + nonce.toString(16),
    data: approve,
    to: erc20Address,
    gasPrice: 0,
    gas: 8000000,
  }
  nonce += 1
  const rawTxDeposit = {
    from: accountForSchain,
    nonce: '0x' + nonce.toString(16),
    data: deposit,
    to: tokenManagerAddress,
    gasPrice: 0,
    gas: 8000000,
    value: web3ForSchain.utils.toHex(web3ForSchain.utils.toWei('1', 'ether')),
  }

  const txApprove = new Tx(rawTxApprove)
  const txDeposit = new Tx(rawTxDeposit)
  txApprove.sign(privateKey)
  txDeposit.sign(privateKey)

  const serializedTxApprove = txApprove.serialize()
  const serializedTxDeposit = txDeposit.serialize()

  const approveReceipt = await web3ForSchain.eth.sendSignedTransaction(
    '0x' + serializedTxApprove.toString('hex')
  )
  console.log({ approveReceipt })

  const depositReceipt = await web3ForSchain.eth.sendSignedTransaction(
    '0x' + serializedTxDeposit.toString('hex')
  )
  console.log({ depositReceipt })

  // tokenManager.getPastEvents("ERC20TokenCreated", {
  //     "filter": {"contractThere": [erc20Address]},
  //     "fromBlock": 0,
  //     "toBlock": "latest"
  // }, (error, events) => {console.log(events);}).then((events) => {
  //     console.log("New Created ERC20 clone on Skale Chain: " + events[0].returnValues.contractHere);
  //     const jsonObject = {
  //         erc20_address: events[0].returnValues.contractHere,
  //         erc20_abi: erc20ABI
  //     };

  //     fs.writeFile("./contracts/ERC20_schain_proxy.json", JSON.stringify(jsonObject), function (err) {
  //         if (err) {
  //             return console.log(err);
  //         }
  //         console.log('Done, check ERC20_schain_proxy.json file in data folder.');
  //         process.exit(0);
  //     });
  // });
}

exec()
