const { expect } = require('chai')
const Heap = require('heap')
const { BN, ether, time } = require('openzeppelin-test-helpers')
const Web3Utils = require('web3-utils')

const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriBonding = artifacts.require('./JuriBonding.sol')
const JuriNetworkProxy = artifacts.require('./JuriNetworkProxy.sol')
const SkaleFileStorageMock = artifacts.require('./SkaleFileStorageMock.sol')

const { duration, increase } = time

const StageMapping = {
  '0': 'USER_ADDING_HEART_RATE_DATA',
  '1': 'NODES_ADDING_RESULT_COMMITMENTS',
  '2': 'NODES_ADDING_RESULT_REVEALS',
  '3': 'DISSENTING_PERIOD',
  '4': 'DISSENTS_NODES_ADDING_RESULT_COMMITMENTS',
  '5': 'DISSENTS_NODES_ADDING_RESULT_REVEALS',
  '6': 'SLASHING_PERIOD',
}

const findLowestHashProofIndexes = ({ bondedStake, node }) => {
  const heap = new Heap((a, b) => (a.gt(b) ? -1 : 1))
  const hashesToProofIndex = {}

  for (let proofIndex = 0; proofIndex < bondedStake; proofIndex++) {
    const currentSmallest = heap.peek()
    const hash = new BN(
      Web3Utils.soliditySha3(
        '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        node,
        proofIndex
      ).slice(2),
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

const removeEmptyKeys = obj => {
  for (var propName in obj) {
    if (
      obj[propName] === null ||
      obj[propName] === undefined ||
      obj[propName] === '0' ||
      obj[propName] ===
        '0x0000000000000000000000000000000000000000000000000000000000000000'
    )
      delete obj[propName]
  }
}

// eslint-disable-next-line no-unused-vars
const printState = async ({ proxy, nodes, users }) => {
  const roundIndex = await proxy.roundIndex()

  console.log('******************* NODE STATE *********************')
  for (let i = 0; i < nodes.length; i++) {
    console.log(`******************* NODE STATE ${i} *********************`)
    const node = nodes[i]

    const hasRevealed = await proxy.getHasRevealed(roundIndex, node)
    const nodeActivity = await proxy.getNodeActivityCount(roundIndex, node)

    const result = { hasRevealed, nodeActivity: nodeActivity.toString() }
    removeEmptyKeys(result)

    console.log(result)
  }

  console.log('******************* USER STATE *********************')
  for (let i = 0; i < users.length; i++) {
    console.log(`******************* USER STATE ${i} *********************`)
    const user = users[i]

    const dissented = await proxy.getDissented(roundIndex, user)
    const complianceDataBeforeDissent = await proxy.getComplianceDataBeforeDissent(
      roundIndex,
      user
    )
    const userComplianceData = await proxy.getUserComplianceData(
      roundIndex,
      user
    )

    const result = {
      dissented,
      complianceDataBeforeDissent: complianceDataBeforeDissent.toString(),
      userComplianceData: userComplianceData.toString(),
    }
    removeEmptyKeys(result)

    console.log(result)
  }

  console.log('******************* NODE/USER STATE *********************')
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < users.length; j++) {
      console.log(
        `******************* NODE/USER STATE ${i}/${j} *********************`
      )
      const node = nodes[i]
      const user = users[j]

      const userComplianceDataCommitment = await proxy.getUserComplianceDataCommitment(
        roundIndex,
        node,
        user
      )
      const givenNodeResult = await proxy.getGivenNodeResult(
        roundIndex,
        node,
        user
      )
      const hasDissented = await proxy.getHasDissented(roundIndex, node, user)

      const result = {
        userComplianceDataCommitment,
        givenNodeResult,
        hasDissented,
      }
      removeEmptyKeys(result)

      console.log(result)
    }
  }

  const totalActivityCount = await proxy.getTotalActivityCount(roundIndex)
  const currentStage = await proxy.currentStage()
  const startTime = await proxy.startTime()
  const lastStageUpdate = await proxy.lastStageUpdate()
  const totalJuriFees = await proxy.totalJuriFees()
  const nodeVerifierCount = await proxy.nodeVerifierCount()

  console.log('******************* GENERAL STATE *********************')
  console.log({ currentStage: StageMapping[currentStage.toString()] })

  const result = {
    roundIndex: roundIndex.toString(),
    totalActivityCount: totalActivityCount.toString(),
    startTime: startTime.toString(),
    lastStageUpdate: lastStageUpdate.toString(),
    totalJuriFees: totalJuriFees.toString(),
    nodeVerifierCount: nodeVerifierCount.toString(),
  }

  removeEmptyKeys(result)

  console.log(result)

  try {
    const firstDissentedUser = await proxy.dissentedUsers(1)
    console.log({ firstDissentedUser })
  } catch (error) {}
}

const runSetupRound = async ({ node, proxy, user }) => {
  await proxy.addHeartRateDateForPoolUser(
    '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    '0x02163123/123-heartRateData.xml',
    { from: user }
  )

  await increase(duration.days(7))

  const users = [user]
  const wasCompliant = true
  const randomNonce =
    '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100'
  const proofIndex = 100
  const commitment = Web3Utils.soliditySha3(wasCompliant, randomNonce)

  await proxy.addWasCompliantDataCommitmentsForUsers(
    users,
    [commitment],
    [proofIndex],
    { from: node }
  )
  await increase(duration.hours(1).add(duration.minutes(5)))

  await proxy.addWasCompliantDataForUsers(
    users,
    [wasCompliant],
    [randomNonce],
    { from: node }
  )

  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveToDissentPeriod()
  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveFromDissentToNextPeriod()
  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveToNextRound()
}

const hasNewHashesToAdd = ({
  currentLowestHashesForUser,
  lowestHashFromNodeForUser,
}) => {
  const currentLowestHashesForUserBN = currentLowestHashesForUser
    .map(hash => new BN(hash.slice(2), 16))
    .sort((a, b) => (a.gt(b) ? 1 : -1))
  const currentMaxHashForUser = currentLowestHashesForUserBN[1]
  const lowestHashFromNodeForUserBN = new BN(
    lowestHashFromNodeForUser.slice(2),
    16
  )

  return currentMaxHashForUser.gt(lowestHashFromNodeForUserBN)
}

const addLowestHashes = async ({
  commitments,
  lowestHashesForNode,
  node,
  proofIndexesForNode,
  proxy,
  users,
}) => {
  const hashesToAddIndexes = []

  const currentLowestHashes = [
    await proxy.getUserWorkAssignmentHashes(2, users[0]),
    await proxy.getUserWorkAssignmentHashes(2, users[1]),
    await proxy.getUserWorkAssignmentHashes(2, users[2]),
    await proxy.getUserWorkAssignmentHashes(2, users[3]),
  ].map(hashList =>
    hashList.map(hashBN => '0x' + hashBN.toString(16).padStart(64, '0'))
  )

  for (let j = 0; j < users.length; j++) {
    if (
      hasNewHashesToAdd({
        currentLowestHashesForUser: currentLowestHashes[j],
        lowestHashFromNodeForUser: lowestHashesForNode[j],
      })
    )
      hashesToAddIndexes.push(j)
  }

  if (hashesToAddIndexes.length > 0) {
    const mappedUsers = hashesToAddIndexes.map(index => users[index])
    const mappedCommitments = hashesToAddIndexes.map(
      index => commitments[index]
    )
    const mappedProofIndexes = hashesToAddIndexes.map(
      index => proofIndexesForNode[index]
    )

    await proxy.addWasCompliantDataCommitmentsForUsers(
      mappedUsers,
      mappedCommitments,
      mappedProofIndexes,
      { from: node }
    )
  }
}

const getAssignedUsersIndexes = async ({ node, proxy, users }) => {
  const assignedUsersIndexes = []

  for (let i = 0; i < users.length; i++) {
    const wasAssignedToUser = await proxy.getWasAssignedToUser(
      2,
      node,
      users[i]
    )

    if (wasAssignedToUser) assignedUsersIndexes.push(i)
  }

  return assignedUsersIndexes
}

const runFirstHalfOfRound = async ({
  commitments,
  lowestHashes,
  nodes,
  proofIndexes,
  proxy,
  randomNonces,
  users,
  wasCompliantData,
  notRevealNodes = [],
}) => {
  for (let i = 0; i < users.length; i++) {
    await proxy.addHeartRateDateForPoolUser(
      users[i],
      `0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100`,
      `0x01/123-heartRateData.xml`
    )
  }

  await increase(duration.days(7).add(duration.minutes(5)))

  for (let i = 0; i < nodes.length; i++) {
    if (i > 1 && lowestHashes) {
      await addLowestHashes({
        lowestHashesForNode: lowestHashes[i],
        node: nodes[i],
        proofIndexesForNode: proofIndexes[i],
        commitments,
        proxy,
        users,
      })
    } else {
      /* const currentLowestHashes = [
        await proxy.getUserWorkAssignmentHashes(2, users[0]),
        await proxy.getUserWorkAssignmentHashes(2, users[1]),
        await proxy.getUserWorkAssignmentHashes(2, users[2]),
        await proxy.getUserWorkAssignmentHashes(2, users[3]),
      ].map(hashList =>
        hashList.map(hashBN => '0x' + hashBN.toString(16).padStart(64, '0'))
      )

      const newToAddHashes = proofIndexes[i].map(proofIndex =>
        Web3Utils.soliditySha3(
          '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
          nodes[i],
          proofIndex
        )
      )

      console.log({ currentLowestHashes, newToAddHashes }) */
      await proxy.addWasCompliantDataCommitmentsForUsers(
        users,
        commitments,
        proofIndexes[i],
        { from: nodes[i] }
      )
    }
  }

  await increase(duration.hours(1).add(duration.minutes(5)))
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (!notRevealNodes.includes(node)) {
      const assignedUsersIndexes = await getAssignedUsersIndexes({
        node,
        proxy,
        users,
      })

      if (assignedUsersIndexes.length > 0) {
        const mappedUsers = assignedUsersIndexes.map(index => users[index])
        const mappedWasCompliantData = assignedUsersIndexes.map(
          index => wasCompliantData[index]
        )
        const mappedRandomNonces = assignedUsersIndexes.map(
          index => randomNonces[index]
        )
        await proxy.addWasCompliantDataForUsers(
          mappedUsers,
          mappedWasCompliantData,
          mappedRandomNonces,
          { from: node }
        )
      }
    }
  }
}

const runDissentRound = async ({
  proxy,
  dissenterNode,
  commitments,
  nodes,
  randomNonces,
  users,
  wasCompliantData,
}) => {
  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveToDissentPeriod()

  for (let i = 0; i < users.length; i++) {
    const dissentedUser = users[i]
    await proxy.dissentToAcceptedAnswer(dissentedUser, {
      from: dissenterNode,
    })
  }

  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveFromDissentToNextPeriod()

  for (let i = 0; i < nodes.length; i++) {
    await proxy.addDissentWasCompliantDataCommitmentsForUsers(
      users,
      commitments,
      { from: nodes[i] }
    )
  }

  await increase(duration.hours(1).add(duration.minutes(5)))

  for (let i = 0; i < nodes.length; i++) {
    await proxy.addDissentWasCompliantDataForUsers(
      users,
      wasCompliantData,
      randomNonces,
      { from: nodes[i] }
    )
  }

  await increase(duration.hours(1).add(duration.minutes(5)))
  await proxy.moveToSlashingPeriod()
}

const itRunsProxyRoundCorrectly = async addresses => {
  describe.only('when running a round', async () => {
    let bonding,
      incorrectDissentPenalty,
      incorrectResultPenalty,
      juriNode1,
      juriNode2,
      juriNode3,
      juriNode4,
      juriNode5,
      juriNode6,
      networkProxy,
      notRevealPenalty,
      poolUser1,
      poolUser2,
      poolUser3,
      poolUser4,
      skaleFileStorage,
      offlinePenalty,
      token

    beforeEach(async () => {
      offlinePenalty = new BN(10)
      notRevealPenalty = new BN(20)
      incorrectResultPenalty = new BN(35)
      incorrectDissentPenalty = new BN(40)
      skaleFileStorage = await SkaleFileStorageMock.new()
      token = await ERC20Mintable.new()
      networkProxy = await JuriNetworkProxy.new(
        token.address,
        skaleFileStorage.address,
        duration.days(7),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        duration.hours(1),
        ether('1000'),
        offlinePenalty,
        notRevealPenalty,
        incorrectResultPenalty,
        incorrectDissentPenalty
      )
      bonding = await JuriBonding.at(await networkProxy.bonding())
      poolUser1 = addresses[0]
      poolUser2 = addresses[1]
      poolUser3 = addresses[2]
      poolUser4 = addresses[3]
      juriNode1 = addresses[4]
      juriNode2 = addresses[5]
      juriNode3 = addresses[6]
      juriNode4 = addresses[7]
      juriNode5 = addresses[8]
      juriNode6 = addresses[9]

      await Promise.all(
        addresses
          .slice(0, 10)
          .map(address => token.mint(address, ether('1000000')))
      )
      await Promise.all(
        addresses
          .slice(4, 10)
          .map(node =>
            token
              .approve(bonding.address, ether('10000'), { from: node })
              .then(() => bonding.bondStake(ether('10000'), { from: node }))
          )
      )

      await networkProxy.registerJuriStakingPool(poolUser1)
      await networkProxy.debugIncreaseRoundIndex()

      await runSetupRound({
        node: juriNode1,
        user: poolUser1,
        proxy: networkProxy,
      })
    })

    it('runs the round correctly', async () => {
      const nodes = [juriNode1, juriNode2, juriNode3, juriNode4]
      const users = [poolUser1, poolUser2, poolUser3, poolUser4]
      const wasCompliantData = [true, false, false, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x78656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
        Web3Utils.soliditySha3(wasCompliantData[2], randomNonces[2]),
        Web3Utils.soliditySha3(wasCompliantData[3], randomNonces[3]),
      ]

      const lowestProofIndexesWithHashes = [...Array(4).keys()].map(i => {
        const { lowestHashes, proofIndexes } = findLowestHashProofIndexes({
          bondedStake: 100,
          node: nodes[i],
        })

        return {
          lowestHashes: lowestHashes.map(
            index => '0x' + index.toString(16).padStart(64, '0')
          ),
          proofIndexes,
        }
      })

      const lowestHashes = lowestProofIndexesWithHashes.map(a => a.lowestHashes)
      const proofIndexes = lowestProofIndexesWithHashes.map(a => a.proofIndexes)

      await runFirstHalfOfRound({
        proxy: networkProxy,
        commitments,
        lowestHashes,
        nodes,
        proofIndexes,
        randomNonces,
        users,
        wasCompliantData,
      })

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToDissentPeriod()
      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveFromDissentToNextPeriod()
      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()

      for (let i = 0; i < users.length; i++) {
        const wasCompliant = (await networkProxy.getUserComplianceData(
          2,
          users[i]
        )).gt(new BN(0))

        expect(wasCompliant).to.be.equal(wasCompliantData[i])
      }
    })

    it('runs the round correctly with multiple proof indexes per node', async () => {
      const users = [poolUser1, poolUser1, poolUser2]

      for (let i = 1; i < users.length; i++) {
        await networkProxy.addHeartRateDateForPoolUser(
          users[i],
          `0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100`,
          `0x01/123-heartRateData.xml`
        )
      }

      await increase(duration.days(7).add(duration.minutes(5)))

      const proofIndexes = [10, 22, 32]
      const wasCompliantData = [true, true, false]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
        Web3Utils.soliditySha3(wasCompliantData[2], randomNonces[2]),
      ]

      await networkProxy.addWasCompliantDataCommitmentsForUsers(
        users,
        commitments,
        proofIndexes,
        { from: juriNode1 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.addWasCompliantDataForUsers(
        users.slice(1),
        wasCompliantData.slice(1),
        randomNonces.slice(1),
        { from: juriNode1 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToDissentPeriod()
      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveFromDissentToNextPeriod()
      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()

      for (let i = 0; i < users.length; i++) {
        const wasCompliant = (await networkProxy.getUserComplianceData(
          2,
          users[i]
        )).gt(new BN(0))

        expect(wasCompliant).to.be.equal(wasCompliantData[i])
      }

      const getNodeActivityCount = await networkProxy.getNodeActivityCount(
        2,
        juriNode1
      )
      expect(getNodeActivityCount).to.be.bignumber.equal(new BN(users.length))
    })

    it('runs the round correctly with offline slashing', async () => {
      const nodes = [juriNode1, juriNode2, juriNode3, juriNode4]
      const users = [poolUser1, poolUser2, poolUser3, poolUser4]
      const wasCompliantData = [true, false, false, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x78656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const proofIndexes = [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [14, 24, 32, 4],
      ]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
        Web3Utils.soliditySha3(wasCompliantData[2], randomNonces[2]),
        Web3Utils.soliditySha3(wasCompliantData[3], randomNonces[3]),
      ]

      await runFirstHalfOfRound({
        proxy: networkProxy,
        commitments,
        nodes,
        proofIndexes,
        randomNonces,
        users,
        wasCompliantData,
      })

      const dissentNodes = [juriNode5]
      const dissentUsers = [poolUser1]
      const dissentWasCompliantData = [wasCompliantData[0]]
      const dissentRandomNonces = [
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const dissentCommitments = [
        Web3Utils.soliditySha3(
          dissentWasCompliantData[0],
          dissentRandomNonces[0]
        ),
      ]

      await runDissentRound({
        proxy: networkProxy,
        dissenterNode: nodes[0],
        commitments: dissentCommitments,
        nodes: dissentNodes,
        randomNonces: dissentRandomNonces,
        users: dissentUsers,
        wasCompliantData: dissentWasCompliantData,
      })

      const stakedBalanceToSlashBefore = await bonding.bondedStakes(juriNode6)
      const stakedBalanceSlasherBefore = await bonding.bondedStakes(nodes[1])
      await bonding.slashStakeForBeingOffline(juriNode6, users[0], {
        from: nodes[1],
      })
      const stakedBalanceToSlashAfter = await bonding.bondedStakes(juriNode6)
      const stakedBalanceSlasherAfter = await bonding.bondedStakes(nodes[1])

      expect(stakedBalanceToSlashAfter.newStake).to.be.bignumber.equal(
        stakedBalanceToSlashBefore.newStake.sub(
          stakedBalanceToSlashBefore.newStake
            .mul(offlinePenalty)
            .div(new BN(100))
        )
      )

      expect(stakedBalanceSlasherAfter.newStake).to.be.bignumber.equal(
        stakedBalanceSlasherBefore.newStake.add(
          stakedBalanceToSlashBefore.newStake
            .mul(offlinePenalty)
            .div(new BN(100))
        )
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()
    })

    it('runs the round correctly with not reveal slashing', async () => {
      const nodes = [juriNode1, juriNode2, juriNode3, juriNode4]
      const users = [poolUser1, poolUser2, poolUser3, poolUser4]
      const wasCompliantData = [true, false, false, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x78656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const proofIndexes = [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [14, 24, 32, 4],
      ]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
        Web3Utils.soliditySha3(wasCompliantData[2], randomNonces[2]),
        Web3Utils.soliditySha3(wasCompliantData[3], randomNonces[3]),
      ]

      await runFirstHalfOfRound({
        proxy: networkProxy,
        commitments,
        nodes,
        proofIndexes,
        randomNonces,
        users,
        wasCompliantData,
        notRevealNodes: [nodes[0]],
      })

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToDissentPeriod()
      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveFromDissentToNextPeriod()

      const stakedBalanceToSlashBefore = await bonding.bondedStakes(nodes[0])
      const stakedBalanceSlasherBefore = await bonding.bondedStakes(nodes[1])
      await bonding.slashStakeForNotRevealing(nodes[0], users[0], {
        from: nodes[1],
      })
      const stakedBalanceToSlashAfter = await bonding.bondedStakes(nodes[0])
      const stakedBalanceSlasherAfter = await bonding.bondedStakes(nodes[1])

      expect(stakedBalanceToSlashAfter.newStake).to.be.bignumber.equal(
        stakedBalanceToSlashBefore.newStake.sub(
          stakedBalanceToSlashBefore.newStake
            .mul(notRevealPenalty)
            .div(new BN(100))
        )
      )

      expect(stakedBalanceSlasherAfter.newStake).to.be.bignumber.equal(
        stakedBalanceSlasherBefore.newStake.add(
          stakedBalanceToSlashBefore.newStake
            .mul(notRevealPenalty)
            .div(new BN(100))
        )
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()
    })

    it('runs the round correctly with incorrect dissent slashing', async () => {
      const nodes = [juriNode1, juriNode2, juriNode3, juriNode4]
      const users = [poolUser1, poolUser2, poolUser3, poolUser4]
      const wasCompliantData = [true, false, false, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x78656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const proofIndexes = [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [14, 24, 32, 4],
      ]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
        Web3Utils.soliditySha3(wasCompliantData[2], randomNonces[2]),
        Web3Utils.soliditySha3(wasCompliantData[3], randomNonces[3]),
      ]

      await runFirstHalfOfRound({
        proxy: networkProxy,
        commitments,
        nodes,
        proofIndexes,
        randomNonces,
        users,
        wasCompliantData,
      })

      const dissentNodes = [juriNode5, juriNode6]
      const dissentUsers = [poolUser1]
      const dissentWasCompliantData = [wasCompliantData[0]]
      const dissentRandomNonces = [
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const dissentCommitments = [
        Web3Utils.soliditySha3(
          dissentWasCompliantData[0],
          dissentRandomNonces[0]
        ),
      ]

      await runDissentRound({
        proxy: networkProxy,
        dissenterNode: nodes[0],
        commitments: dissentCommitments,
        nodes: dissentNodes,
        randomNonces: dissentRandomNonces,
        users: dissentUsers,
        wasCompliantData: dissentWasCompliantData,
      })

      const stakedBalanceToSlashBefore = await bonding.bondedStakes(nodes[0])
      const stakedBalanceSlasherBefore = await bonding.bondedStakes(nodes[1])
      await bonding.slashStakeForIncorrectDissenting(nodes[0], users[0], {
        from: nodes[1],
      })
      const stakedBalanceToSlashAfter = await bonding.bondedStakes(nodes[0])
      const stakedBalanceSlasherAfter = await bonding.bondedStakes(nodes[1])

      expect(stakedBalanceToSlashAfter.newStake).to.be.bignumber.equal(
        stakedBalanceToSlashBefore.newStake.sub(
          stakedBalanceToSlashBefore.newStake
            .mul(incorrectDissentPenalty)
            .div(new BN(100))
        )
      )

      expect(stakedBalanceSlasherAfter.newStake).to.be.bignumber.equal(
        stakedBalanceSlasherBefore.newStake.add(
          stakedBalanceToSlashBefore.newStake
            .mul(incorrectDissentPenalty)
            .div(new BN(100))
        )
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()
    })

    it.only('runs the round correctly with incorrect result slashing', async () => {
      // FIRST ROUND DATA
      const nodes = [juriNode1, juriNode2]
      const users = [poolUser1, poolUser2]
      const wasCompliantData = [true, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const proofIndexes = [[100, 200], [100, 200]]
      const commitments = [
        Web3Utils.soliditySha3(wasCompliantData[0], randomNonces[0]),
        Web3Utils.soliditySha3(wasCompliantData[1], randomNonces[1]),
      ]

      // DISSENT ROUND DATA
      const dissentNodes = [juriNode3, juriNode4, juriNode5, juriNode6]
      const dissentUsers = [poolUser1]
      const dissentWasCompliantData = [false]
      const dissentRandomNonces = [
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const dissentCommitments = [
        Web3Utils.soliditySha3(
          dissentWasCompliantData[0],
          dissentRandomNonces[0]
        ),
      ]

      await runFirstHalfOfRound({
        proxy: networkProxy,
        commitments,
        nodes,
        proofIndexes,
        randomNonces,
        users,
        wasCompliantData,
      })

      await runDissentRound({
        proxy: networkProxy,
        dissenterNode: nodes[0],
        commitments: dissentCommitments,
        nodes: dissentNodes,
        randomNonces: dissentRandomNonces,
        users: dissentUsers,
        wasCompliantData: dissentWasCompliantData,
      })

      const slashedNode = nodes[0]
      const slasherNode = juriNode3

      const stakedBalanceToSlashBefore = await bonding.bondedStakes(slashedNode)
      const stakedBalanceSlasherBefore = await bonding.bondedStakes(slasherNode)
      await bonding.slashStakeForIncorrectResult(slashedNode, users[0], {
        from: slasherNode,
      })
      const stakedBalanceToSlashAfter = await bonding.bondedStakes(slashedNode)
      const stakedBalanceSlasherAfter = await bonding.bondedStakes(slasherNode)

      expect(stakedBalanceToSlashAfter.newStake).to.be.bignumber.equal(
        stakedBalanceToSlashBefore.newStake.sub(
          stakedBalanceToSlashBefore.newStake
            .mul(incorrectResultPenalty)
            .div(new BN(100))
        )
      )

      expect(stakedBalanceSlasherAfter.newStake).to.be.bignumber.equal(
        stakedBalanceSlasherBefore.newStake.add(
          stakedBalanceToSlashBefore.newStake
            .mul(incorrectResultPenalty)
            .div(new BN(100))
        )
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToNextRound()
    })
  })
}

module.exports = itRunsProxyRoundCorrectly

/* const currentHighestHash0 = await proxy.getCurrentHighestHashForUser(
  users[0]
)
const verifierHash0 = [
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[0],
    proofIndexes[0]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[1],
    proofIndexes[0]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[2],
    proofIndexes[0]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[3],
    proofIndexes[0]
  ),
]
console.log({
  currentHighestHash0: '0x' + currentHighestHash0.toString(16),
  verifierHash0,
})

const currentHighestHash1 = await proxy.getCurrentHighestHashForUser(
  users[1]
)
const verifierHash1 = [
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[0],
    proofIndexes[1]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[1],
    proofIndexes[1]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[2],
    proofIndexes[1]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[3],
    proofIndexes[1]
  ),
]
console.log({
  currentHighestHash1: '0x' + currentHighestHash1.toString(16),
  verifierHash1,
})

const currentHighestHash2 = await proxy.getCurrentHighestHashForUser(
  users[2]
)
const verifierHash2 = [
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[0],
    proofIndexes[2]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[1],
    proofIndexes[2]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[2],
    proofIndexes[2]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[3],
    proofIndexes[2]
  ),
]
console.log({
  currentHighestHash2: '0x' + currentHighestHash2.toString(16),
  verifierHash2,
})

const currentHighestHash3 = await proxy.getCurrentHighestHashForUser(
  users[3]
)
const verifierHash3 = [
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[0],
    proofIndexes[3]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[1],
    proofIndexes[3]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[2],
    proofIndexes[3]
  ),
  Web3Utils.soliditySha3(
    '0x00156c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    nodes[3],
    proofIndexes[3]
  ),
]
console.log({
  currentHighestHash3: '0x' + currentHighestHash3.toString(16),
  verifierHash3,
}) */
