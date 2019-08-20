const moveToNextStage = require('./moveToNextStage')
const { sleep } = require('../helpers')

const waitForNextStage = async ({ from, key, isMovingStage }) => {
  if (isMovingStage) {
    console.log('Moving stage...')
    await moveToNextStage({ from, key })
    await sleep(9980)
  } else await sleep(10000)
}

module.exports = waitForNextStage
