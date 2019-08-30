const waitForNextStage = require('./waitForNextStage')
const sendCommitments = require('./sendCommitments')
const sendReveals = require('./sendReveals')

const runDissentRound = async ({
  dissentedUsers,
  from,
  isMovingStage,
  isSendingResults,
  key,
  myJuriNodeAddress,
  myJuriNodePrivateKey,
  nodeIndex,
  timePerStage,
  uniqUsers,
  wasCompliantData,
}) => {
  let randomNumbers

  // STAGE 5.1

  if (isSendingResults) {
    console.log(`Sending dissent commitments... (node ${nodeIndex})`)
    randomNumbers = (await sendCommitments({
      users: dissentedUsers,
      isDissent: true,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
      nodeIndex,
      wasCompliantData,
    })).randomNumbers
    console.log(`Sent dissent commitments (node ${nodeIndex})!`)
  }

  // await sleep(times[timeForDissentCommitmentStage])
  await waitForNextStage({ from, key, timePerStage, isMovingStage: false })

  // STAGE 5.2
  if (isSendingResults) {
    const dissentWasCompliantData = dissentedUsers
      .map(user => uniqUsers.indexOf(user))
      .filter(index => index >= 0)
      .map(index => wasCompliantData[index])

    console.log({ dissentWasCompliantData })

    console.log(`Sending dissent reveals... (node ${nodeIndex})`)
    await sendReveals({
      users: dissentedUsers,
      randomNumbers,
      wasCompliantData: dissentWasCompliantData,
      isDissent: true,
      myJuriNodeAddress,
      myJuriNodePrivateKey,
    })
    console.log(`Dissent reveals sent (node ${nodeIndex})!`)
  }

  // await sleep(times[timeForDissentRevealStage])
  await waitForNextStage({ from, key, timePerStage, isMovingStage: false })
}

module.exports = runDissentRound
