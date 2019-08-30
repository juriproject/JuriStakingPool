const findAllNotRevealedNodes = require('./findAllNotRevealedNodes')
const findAllOfflineNodes = require('./findAllOfflineNodes')
const findAllIncorrectResultNodes = require('./findAllIncorrectResultNodes')
const findAllIncorrectDissentNodes = require('./findAllIncorrectDissentNodes')

const { parseRevertMessage, sendTx } = require('../../helpers')
const { web3 } = require('../../config')

const slashDishonestNodes = async ({
  allNodes,
  allUsers,
  dissentedUsers,
  bondingAddress,
  BondingContract,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  nodeIndex,
  roundIndex,
}) => {
  const notRevealedNodes = await findAllNotRevealedNodes({
    allNodes,
    allUsers,
    roundIndex,
  })
  const offlineNodes = await findAllOfflineNodes({
    allNodes,
    dissentedUsers,
    roundIndex,
  })
  const incorrectResultNodes = await findAllIncorrectResultNodes({
    allNodes,
    bondingAddress,
    dissentedUsers,
    roundIndex,
  })
  const incorrectDissentNodes = await findAllIncorrectDissentNodes({
    allNodes,
    dissentedUsers,
    roundIndex,
  })

  console.log({
    nodeIndex,
    notRevealedNodes: notRevealedNodes.map(({ toSlash }) =>
      allNodes.indexOf(toSlash)
    ),
    offlineNodes: offlineNodes.map(({ toSlash }) => allNodes.indexOf(toSlash)),
    incorrectResultNodes: incorrectResultNodes.map(({ toSlash }) =>
      allNodes.indexOf(toSlash)
    ),
    incorrectDissentNodes: incorrectDissentNodes.map(({ toSlash }) =>
      allNodes.indexOf(toSlash)
    ),
  })

  for (let i = 0; i < notRevealedNodes.length; i++) {
    const { toSlash, user } = notRevealedNodes[i]

    console.log(
      `Slash not revealed [node=${toSlash}] for [user=${user}]... (node ${nodeIndex})`
    )

    try {
      await sendTx({
        data: BondingContract.methods
          .slashStakeForNotRevealing(toSlash, user)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: bondingAddress,
        web3,
      })
      console.log(`Successfully slashed not revealed (node ${nodeIndex})!`)
    } catch (error) {
      console.log(
        `NotRevealSlashError: ${parseRevertMessage(
          error.message
        )} (node ${nodeIndex})`
      )
    }
  }

  for (let i = 0; i < offlineNodes.length; i++) {
    const { toSlash, user } = offlineNodes[i]

    console.log(
      `Slash offline [node=${toSlash}] for [user=${user}]... (node ${nodeIndex})`
    )

    try {
      await sendTx({
        data: BondingContract.methods
          .slashStakeForBeingOffline(toSlash, user)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: bondingAddress,
        web3,
      })
      console.log(`Successfully slashed for offline (node ${nodeIndex})!`)
    } catch (error) {
      console.log(
        `OfflineSlashError: ${parseRevertMessage(
          error.message
        )} (node ${nodeIndex})`
      )
    }
  }

  for (let i = 0; i < incorrectResultNodes.length; i++) {
    const { toSlash, user } = incorrectResultNodes[i]

    console.log(
      `Slash incorrect result [node=${toSlash}] for [user=${user}]... (node ${nodeIndex})`
    )

    try {
      await sendTx({
        data: BondingContract.methods
          .slashStakeForIncorrectResult(toSlash, user)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: bondingAddress,
        web3,
      })
      console.log(
        `Successfully slashed for incorrect result (node ${nodeIndex})!`
      )
    } catch (error) {
      console.log(
        `IncorrectResultSlashError: ${parseRevertMessage(
          error.message
        )} (node ${nodeIndex})`
      )
    }
  }

  for (let i = 0; i < incorrectDissentNodes.length; i++) {
    const { toSlash, user } = incorrectDissentNodes[i]

    console.log(
      `Slash incorrect dissent [node=${toSlash}] for [user=${user}]... (node ${nodeIndex})`
    )

    try {
      await sendTx({
        data: BondingContract.methods
          .slashStakeForIncorrectDissenting(toSlash, user)
          .encodeABI(),
        from: myJuriNodeAddress,
        privateKey: myJuriNodePrivateKey,
        to: bondingAddress,
        web3,
      })
      console.log(
        `Succesfully slashed for incorrect dissent (node ${nodeIndex})!`
      )
    } catch (error) {
      console.log(
        `IncorrectDissentSlashError: ${parseRevertMessage(
          error.message
        )} (node ${nodeIndex})`
      )
    }
  }
}

module.exports = slashDishonestNodes
