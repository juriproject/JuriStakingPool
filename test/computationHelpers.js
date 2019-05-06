const { BN } = require('openzeppelin-test-helpers')

const computeNewCompliantStake = ({ compliantGainPercentage, userStake }) =>
  userStake.mul(new BN(100).add(compliantGainPercentage)).div(new BN(100))

const computeNewNonCompliantStake = ({
  maxNonCompliantPenaltyPercentage,
  totalPayout,
  totalStakeToSlash,
  userStake,
}) => {
  const useMaxNonCompliancy = computeUseMaxNonCompliancy({
    maxNonCompliantPenaltyPercentage,
    totalPayout,
    totalStakeToSlash,
  })

  if (useMaxNonCompliancy)
    return userStake.sub(
      userStake.mul(maxNonCompliantPenaltyPercentage).div(new BN(100))
    )

  return userStake
    .mul(totalStakeToSlash.sub(totalPayout))
    .div(totalStakeToSlash)
}

const computeUseMaxNonCompliancy = ({
  maxNonCompliantPenaltyPercentage,
  totalPayout,
  totalStakeToSlash,
}) => {
  if (totalStakeToSlash.eq(new BN(0))) return false

  const nonCompliantFactor = totalPayout.mul(new BN(100)).div(totalStakeToSlash)
  return nonCompliantFactor.gte(maxNonCompliantPenaltyPercentage)
}

const computeJuriFees = ({ feePercentage, totalUserStake }) =>
  totalUserStake.mul(feePercentage).div(new BN(100))

module.exports = {
  computeJuriFees,
  computeNewCompliantStake,
  computeNewNonCompliantStake,
  computeUseMaxNonCompliancy,
}
