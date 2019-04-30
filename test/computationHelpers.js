const { BN } = require('openzeppelin-test-helpers')

const computeNewCompliantStake = ({ compliantGainPercentage, userStake }) =>
  userStake.mul(new BN(100).add(compliantGainPercentage)).div(new BN(100))

module.exports = { computeNewCompliantStake }
