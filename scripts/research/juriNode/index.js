const { NetworkProxyContract, ZERO_ADDRESS } = require('../config')
const { filterAsync, parseRevertMessage } = require('../helpers')

const slashDishonestNodes = require('./slashing')

const checkForInvalidAnswers = require('./checkForInvalidAnswers')
const getAssignedUsersIndexes = require('./getAssignedUsersIndexes')
const retrieveAssignedUsers = require('./retrieveAssignedUsers')
const runDissentRound = require('./runDissentRound')
const sendCommitments = require('./sendCommitments')
const sendReveals = require('./sendReveals')
const waitForNextStage = require('./waitForNextStage')

const runRound = async ({
  bondingAddress,
  BondingContract,
  maxUserCount,
  myJuriNodePrivateKey,
  myJuriNodeAddress,
  nodeIndex,
  timePerStage,
  wasCompliantData,
  failureOptions: {
    isNotRevealing,
    isSendingIncorrectResult,
    isOffline,
    isSendingIncorrectDissent,
  },
}) => {
  const from = myJuriNodeAddress
  const key = myJuriNodePrivateKey

  const complianceData = isSendingIncorrectResult
    ? wasCompliantData.map(wasCompliant => !wasCompliant)
    : wasCompliantData

  /* console.log({
    nodeIndex,
    bondedStake: (await BondingContract.methods
      .getBondedStakeOfNode(allNodes[nodeIndex])
      .call()).toString(),
  }) */

  // SETUP
  const roundIndex = await NetworkProxyContract.methods.roundIndex().call()
  const allNodes = await BondingContract.methods.getAllStakingNodes().call()
  // const times = await fetchStageTimes()

  // STAGE 2
  const { assignedUsers, uniqUsers } = await retrieveAssignedUsers({
    maxUserCount,
    myJuriNodeAddress,
    roundIndex,
  })

  // STAGE 3
  console.log(`Sending commitments... (node ${nodeIndex})`)
  const { randomNumbers } = await sendCommitments({
    users: assignedUsers,
    isDissent: false,
    myJuriNodeAddress,
    myJuriNodePrivateKey,
    nodeIndex,
    wasCompliantData: complianceData,
  })
  console.log(`Sent commitments (node ${nodeIndex})!`)

  // await sleep(times[timeForCommitmentStage])
  await waitForNextStage({ from, key, timePerStage, isMovingStage: false })

  const finishedAssignedUsersIndexes = await getAssignedUsersIndexes({
    myJuriNodeAddress,
    roundIndex,
    users: uniqUsers,
  })

  console.log({ nodeIndex, finishedAssignedUsersIndexes })

  // STAGE 3
  if (!isNotRevealing) {
    console.log(`Sending reveals... (node ${nodeIndex})`)
    await sendReveals({
      users: finishedAssignedUsersIndexes.map(i => assignedUsers[i]),
      randomNumbers: finishedAssignedUsersIndexes.map(i => randomNumbers[i]),
      wasCompliantData: finishedAssignedUsersIndexes.map(
        i => complianceData[i]
      ),
      isDissent: false,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
    })
    console.log(`Sent reveals (node ${nodeIndex})!`)
  } else {
    console.log(`Skipped sending reveals (node ${nodeIndex})!`)
  }

  // await sleep(times[timeForRevealStage])
  await waitForNextStage({ from, key, timePerStage, isMovingStage: false })

  // STAGE 4
  console.log(`Dissenting to invalid answers... (node ${nodeIndex})`)
  await checkForInvalidAnswers({
    bondingAddress,
    isSendingIncorrectDissent,
    roundIndex,
    users: assignedUsers,
    wasCompliantData: complianceData,
    myJuriNodeAddress,
    myJuriNodePrivateKey,
    nodeIndex,
  })
  console.log(`Dissented to invalid answers (node ${nodeIndex})!`)

  // await sleep(times[timeForDissentStage])
  await waitForNextStage({ from, key, timePerStage, isMovingStage: false })

  const resultsBefore = []
  for (let i = 0; i < uniqUsers.length; i++) {
    resultsBefore.push({
      user: uniqUsers[i],
      complianceData: (await NetworkProxyContract.methods
        .getUserComplianceData(roundIndex, uniqUsers[i])
        .call({ from: bondingAddress })).toString(),
    })
  }

  // STAGE 5
  const allDissentedUsers = await NetworkProxyContract.methods
    .getDissentedUsers()
    .call()
  const dissentedUsers = await filterAsync(
    allDissentedUsers,
    async user =>
      (await NetworkProxyContract.methods
        .getUserComplianceDataCommitment(roundIndex, myJuriNodeAddress, user)
        .call()) === ZERO_ADDRESS
  )

  /* console.log({
    nodeIndex,
    allDissentedUsers,
    dissentedUsers,
  }) */

  if (allDissentedUsers.length > 0)
    await runDissentRound({
      dissentedUsers,
      wasCompliantData: complianceData,
      from,
      key,
      isSendingResults: !isOffline && dissentedUsers.length > 0,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
      nodeIndex,
      timePerStage,
      uniqUsers,
    })
  else await waitForNextStage({ from, key, timePerStage, isMovingStage: false })

  const resultsAfter = []
  for (let i = 0; i < uniqUsers.length; i++) {
    resultsAfter.push({
      user: uniqUsers[i],
      complianceData: (await NetworkProxyContract.methods
        .getUserComplianceData(roundIndex, uniqUsers[i])
        .call({ from: bondingAddress })).toString(),
    })
  }

  if (nodeIndex === 0) console.log({ nodeIndex, resultsBefore, resultsAfter })

  console.log(`Slashing dishonest nodes... (node ${nodeIndex})`)
  await slashDishonestNodes({
    allNodes,
    allUsers: uniqUsers,
    dissentedUsers,
    bondingAddress,
    BondingContract,
    myJuriNodeAddress,
    myJuriNodePrivateKey,
    nodeIndex,
    roundIndex,
  })
  console.log(`Dishonest nodes slashed (node ${nodeIndex})!`)

  // FINISH UP
  /* const balanceJuriTokenBefore = (await JuriTokenContract.methods
    .balanceOf(myJuriNodeAddress)
    .call()).toString()
  const balanceJuriFeesTokenBefore = (await JuriFeesTokenContract.methods
    .balanceOf(myJuriNodeAddress)
    .call()).toString()

  await retrieveRewards({ JuriTokenContract, juriTokenAddress, roundIndex })

  const balanceJuriTokenAfter = (await JuriTokenContract.methods
    .balanceOf(myJuriNodeAddress)
    .call()).toString()
  const balanceJuriFeesTokenAfter = (await JuriFeesTokenContract.methods
    .balanceOf(myJuriNodeAddress)
    .call()).toString()

  console.log({ balanceJuriTokenBefore, balanceJuriTokenAfter })
  console.log({ balanceJuriFeesTokenBefore, balanceJuriFeesTokenAfter }) */

  // await sleep(times[timeForSlashingStage])

  // STAGE 7
  // await moveToNextRound()
}

const safeRunRound = async params => {
  try {
    await runRound(params)
  } catch ({ message }) {
    console.log({
      nodeIndex: params.nodeIndex,
      RunRoundError: message.includes('revertReason')
        ? parseRevertMessage(message)
        : message,
    })
  }
}

module.exports = safeRunRound
