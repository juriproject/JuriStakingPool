const { NetworkProxyContract } = require('../config')

const fetchStageTimes = async () => {
  const stageNames = [
    'timeForAddingHeartRateData',
    'timeForCommitmentStage',
    'timeForRevealStage',
    'timeForDissentStage',
    'timeForDissentCommitmentStage',
    'timeForDissentRevealStage',
    'timeForSlashingStage',
  ]

  const stageTimes = []

  for (let i = 0; i < stageNames.length; i++) {
    stageTimes.push(await NetworkProxyContract.methods.timesForStages(i).call())
  }

  return stageNames.map((name, i) => ({ name, time: stageTimes[i] }))
}

module.exports = fetchStageTimes
