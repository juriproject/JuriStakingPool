const { BN } = require('openzeppelin-test-helpers')

const computeNewCompliantStake = ({ compliantGainPercentage, userStake }) =>
  userStake.mul(new BN(100).add(compliantGainPercentage)).div(new BN(100))

const computeMaxLossNewStake = ({
  maxNonCompliantPenaltyPercentage,
  userStake,
}) =>
  userStake.sub(
    userStake.mul(maxNonCompliantPenaltyPercentage).div(new BN(100))
  )

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
    return computeMaxLossNewStake({
      maxNonCompliantPenaltyPercentage,
      userStake,
    })

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

const computeTotalUserStake = poolStakes =>
  poolStakes.reduce(
    (totalStake, userStake) => totalStake.add(userStake),
    new BN(0)
  )

const computeTotalPayout = ({
  compliantGainPercentage,
  compliantThreshold,
  feePercentage,
  poolStakes,
}) => {
  const totalUserStake = computeTotalUserStake(poolStakes)

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

const computeMinOwnerFunds = ({ compliantGainPercentage, poolStakes }) => {
  const totalUserStake = computeTotalUserStake(poolStakes)

  const maxNewStakeAfterRound = totalUserStake.mul(
    new BN(100).add(compliantGainPercentage)
  )

  return maxNewStakeAfterRound.sub(totalUserStake)
}

module.exports = {
  computeJuriFees,
  computeMaxLossNewStake,
  computeMinOwnerFunds,
  computeNewCompliantStake,
  computeNewNonCompliantStake,
  computeTotalPayout,
  computeTotalStakeToSlash,
  computeUnderWriterLiability,
  computeUseMaxNonCompliancy,
}
