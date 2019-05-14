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

const computeTotalPayout = ({
  compliantGainPercentage,
  compliantThreshold,
  feePercentage,
  poolStakes,
}) => {
  const totalUserStake = poolStakes.reduce(
    (totalStake, userStake) => totalStake.add(userStake),
    new BN(0)
  )

  const juriFees = computeJuriFees({
    feePercentage,
    totalUserStake,
  })

  return poolStakes.reduce(
    (totalPayout, userStake, i) =>
      i >= compliantThreshold
        ? totalPayout.add(
            computeNewCompliantStake({
              compliantGainPercentage,
              userStake,
            }).sub(userStake)
          )
        : totalPayout,
    juriFees
  )
}

const computeTotalStakeToSlash = ({ compliantThreshold, poolStakes }) =>
  poolStakes.reduce(
    (stakeToSlash, userStake, i) =>
      i < compliantThreshold ? stakeToSlash.add(userStake) : stakeToSlash,
    new BN(0)
  )

const computeUnderWriterLiability = ({
  maxNonCompliantPenaltyPercentage,
  totalPayout,
  totalStakeToSlash,
}) => {
  const maxNonCompliantFactor = new BN(100).sub(
    maxNonCompliantPenaltyPercentage
  )
  const slashedStake = totalStakeToSlash
    .mul(maxNonCompliantFactor)
    .div(new BN(100))
  const fundedPayoutFromSlashedStake = totalStakeToSlash.sub(slashedStake)

  return totalPayout.sub(fundedPayoutFromSlashedStake)
}

module.exports = {
  computeJuriFees,
  computeNewCompliantStake,
  computeNewNonCompliantStake,
  computeTotalPayout,
  computeTotalStakeToSlash,
  computeUnderWriterLiability,
  computeUseMaxNonCompliancy,
}
