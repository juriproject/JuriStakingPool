const { expect } = require('chai')
const { BN, ether, time } = require('openzeppelin-test-helpers')
const Web3Utils = require('web3-utils')

const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriBonding = artifacts.require('./JuriBonding.sol')
const JuriNetworkProxy = artifacts.require('./JuriNetworkProxy.sol')
const SkaleFileStorageMock = artifacts.require('./SkaleFileStorageMock.sol')

const { duration, increase } = time

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
  console.log({ currentStage: currentStage.toString() })

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
    user,
    '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
    '0x02163123/123-heartRateData.xml'
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

const runFirstHalfOfRound = async ({
  commitments,
  nodes,
  proofIndexes,
  proxy,
  randomNonces,
  users,
  wasCompliantData,
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
    await proxy.addWasCompliantDataCommitmentsForUsers(
      users,
      commitments,
      proofIndexes,
      { from: nodes[i] }
    )
  }

  await increase(duration.hours(1).add(duration.minutes(5)))
  for (let i = 0; i < nodes.length; i++) {
    await proxy.addWasCompliantDataForUsers(
      users,
      wasCompliantData,
      randomNonces,
      { from: nodes[i] }
    )
  }
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
      poolUser1,
      poolUser2,
      poolUser3,
      poolUser4,
      skaleFileStorage,
      token

    beforeEach(async () => {
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
        10,
        20,
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
      const proofIndexes = [100, 200, 300, 400]
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
      const proofIndexes = [100, 200, 300, 400]
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

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToDissentPeriod()

      const dissentedUser = users[0]
      await networkProxy.dissentToAcceptedAnswer(dissentedUser, {
        from: nodes[0],
      })

      const receivedDissentedUsers = await networkProxy.dissentedUsers(0)
      expect(receivedDissentedUsers).to.equal(dissentedUser)

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveFromDissentToNextPeriod()

      await networkProxy.addDissentWasCompliantDataCommitmentsForUsers(
        [users[0]],
        [commitments[0]],
        [proofIndexes[0]],
        { from: juriNode5 }
      )
      await networkProxy.addDissentWasCompliantDataCommitmentsForUsers(
        [users[0]],
        [commitments[0]],
        [proofIndexes[0]],
        { from: juriNode6 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.addDissentWasCompliantDataForUsers(
        [users[0]],
        [wasCompliantData[0]],
        [randomNonces[0]],
        { from: juriNode5 }
      )
      await networkProxy.addDissentWasCompliantDataForUsers(
        [users[0]],
        [wasCompliantData[0]],
        [randomNonces[0]],
        { from: juriNode6 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToSlashingPeriod()

      await printState({
        proxy: networkProxy,
        nodes,
        users,
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
      const nodes = [juriNode1, juriNode2, juriNode3, juriNode4]
      const users = [poolUser1, poolUser2, poolUser3, poolUser4]
      const wasCompliantData = [true, false, false, true]
      const randomNonces = [
        '0x48656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x58656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x68656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
        '0x78656c6c6f576f726c6448656c6c6f576f726c6448656c6c6f576f726c642100',
      ]
      const proofIndexes = [100, 200, 300, 400]
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

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToDissentPeriod()

      const dissentedUser = users[0]
      await networkProxy.dissentToAcceptedAnswer(dissentedUser, {
        from: nodes[0],
      })

      // TODO change

      const receivedDissentedUsers = await networkProxy.dissentedUsers(0)
      expect(receivedDissentedUsers).to.equal(dissentedUser)

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveFromDissentToNextPeriod()

      await networkProxy.addDissentWasCompliantDataCommitmentsForUsers(
        [users[0]],
        [commitments[0]],
        [proofIndexes[0]],
        { from: juriNode5 }
      )
      await networkProxy.addDissentWasCompliantDataCommitmentsForUsers(
        [users[0]],
        [commitments[0]],
        [proofIndexes[0]],
        { from: juriNode6 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.addDissentWasCompliantDataForUsers(
        [users[0]],
        [wasCompliantData[0]],
        [randomNonces[0]],
        { from: juriNode5 }
      )
      await networkProxy.addDissentWasCompliantDataForUsers(
        [users[0]],
        [wasCompliantData[0]],
        [randomNonces[0]],
        { from: juriNode6 }
      )

      await increase(duration.hours(1).add(duration.minutes(5)))
      await networkProxy.moveToSlashingPeriod()

      await printState({
        proxy: networkProxy,
        nodes,
        users,
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
  })
}

module.exports = itRunsProxyRoundCorrectly
