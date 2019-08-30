const moveToNextStage = require('./moveToNextStage')
const { sleep } = require('../helpers')

const { NetworkProxyContract } = require('../config')

const waitForNextStage = async ({ from, key, isMovingStage, timePerStage }) => {
  if (isMovingStage) {
    await sleep(timePerStage + 200)
    console.log('Moving stage...')
    await moveToNextStage({ from, key })
  } else {
    await sleep(1000)
    const currentStageBefore = parseInt(
      await NetworkProxyContract.methods.currentStage().call()
    )

    const lastStageUpdate = parseInt(
      await NetworkProxyContract.methods.lastStageUpdate().call()
    )
    const now = Date.now() / 1000
    const timeSinceLastStageMove = now - lastStageUpdate
    const timeUntilNextStage = timePerStage - timeSinceLastStageMove

    await sleep(timeUntilNextStage + 2000)

    let currentStageAfter = parseInt(
      await NetworkProxyContract.methods.currentStage().call()
    )

    console.log({
      currentStageBefore,
      currentStageAfter,
    })

    while (currentStageAfter === currentStageBefore) {
      await sleep(2000)
      currentStageAfter = parseInt(
        await NetworkProxyContract.methods.currentStage().call()
      )
    }
  }
}

module.exports = waitForNextStage
