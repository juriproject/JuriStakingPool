const Heap = require('heap')
const Web3Utils = require('web3-utils')

const { web3 } = require('../config')
const { BN } = web3.utils
const workoutSignature =
  '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100'

const findLowestHashProofIndexes = ({ bondedStake, node }) => {
  const heap = new Heap((a, b) => (a.gt(b) ? -1 : 1))
  const hashesToProofIndex = {}

  for (let proofIndex = 0; proofIndex < bondedStake; proofIndex++) {
    const currentSmallest = heap.peek()
    const hash = new BN(
      Web3Utils.soliditySha3(workoutSignature, node, proofIndex).slice(2),
      16
    )

    if (proofIndex <= 3) {
      heap.push(hash)
      hashesToProofIndex[hash] = proofIndex
    } else if (currentSmallest.gt(hash)) {
      heap.pushpop(hash)
      hashesToProofIndex[hash] = proofIndex
    }
  }

  const lowestHashes = heap.toArray()
  const proofIndexes = lowestHashes.map(hash => hashesToProofIndex[hash])

  return { lowestHashes, proofIndexes }
}

module.exports = findLowestHashProofIndexes
