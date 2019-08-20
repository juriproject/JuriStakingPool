const crypto = require('crypto')
const Web3Utils = require('web3-utils')

const { networkProxyAddress, NetworkProxyContract, web3 } = require('../config')
const { sendTx } = require('../helpers')

const sendCommitments = async ({
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  // nodeIndex,
  users,
  isDissent,
  wasCompliantData,
}) => {
  const userAddresses = []
  const wasCompliantDataCommitments = []
  const proofIndices = []
  const randomNumbers = []

  for (let i = 0; i < users.length; i++) {
    const { address, lowestIndex } = users[i]

    // TODO
    /* const heartRateData = await downloadHeartRateData(address)
      const wasCompliant = verifyHeartRateData(heartRateData) */
    const wasCompliant = wasCompliantData[i]
    const randomNumber = '0x' + crypto.randomBytes(32).toString('hex')
    const commitmentHash = Web3Utils.soliditySha3(wasCompliant, randomNumber)

    userAddresses.push(isDissent ? users[i] : address)
    wasCompliantDataCommitments.push(commitmentHash)
    proofIndices.push(lowestIndex)
    randomNumbers.push(randomNumber)
  }

  const addMethod = isDissent
    ? 'addDissentWasCompliantDataCommitmentsForUsers'
    : 'addWasCompliantDataCommitmentsForUsers'
  const addMethodInput = isDissent
    ? [userAddresses, wasCompliantDataCommitments]
    : [userAddresses, wasCompliantDataCommitments, proofIndices]

  await sendTx({
    data: NetworkProxyContract.methods[addMethod](
      ...addMethodInput
    ).encodeABI(),
    from: myJuriNodeAddress,
    privateKey: myJuriNodePrivateKey,
    to: networkProxyAddress,
    web3,
  })

  return { randomNumbers }
}

module.exports = sendCommitments
