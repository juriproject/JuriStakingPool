const { expect } = require('chai')
const { BN } = require('openzeppelin-test-helpers')

const asyncForEach = async ({ array, callback }) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

const logger = (msg, { logLevel = 2 } = {}) => {
  if (process.env.LOG_LEVEL === '2' && logLevel <= 2) console.log(msg)
  if (process.env.LOG_LEVEL === '1' && logLevel <= 1) console.log(msg)
  if (process.env.LOG_LEVEL === '0' && logLevel <= 0) console.log(msg)
}

const logCurrentRound = ({
  juriFees,
  nonCompliancePenalty,
  roundIndex,
  totalPayout,
  totalStakeToSlash,
  useMaxNonCompliancy,
}) => {
  logger('currentRound.roundIndex ' + roundIndex.toString(), {
    logLevel: 1,
  })
  logger('currentRound.totalStakeToSlash: ' + totalStakeToSlash.toString(), {
    logLevel: 1,
  })
  logger(
    'currentRound.nonCompliancePenalty: ' + nonCompliancePenalty.toString(),
    { logLevel: 1 }
  )
  logger('currentRound.totalPayout: ' + totalPayout.toString(), {
    logLevel: 1,
  })
  logger('currentRound.useMaxNonCompliancy: ' + useMaxNonCompliancy, {
    logLevel: 1,
  })
  logger('currentRound.juriFees: ' + juriFees.toString(), {
    logLevel: 1,
  })
}

const logNextRound = ({ totalAddedStake, totalRemovedStake }) => {
  logger('nextRound.totalAddedStake: ' + totalAddedStake.toString())
  logger('nextRound.totalRemovedStake: ' + totalRemovedStake.toString())
}

const logPoolState = async pool => {
  const currentStakingRound = await pool.currentStakingRound()
  const nextStakingRound = await pool.nextStakingRound()
  const userCount = (await pool.getPoolUserCount()).toString()
  const complianceDataIndex = (await pool.complianceDataIndex()).toString()
  const ownerFunds = (await pool.ownerFunds()).toString()
  const totalUserStake = (await pool.totalUserStake()).toString()
  const removalIndices = await pool.getRemovalIndicesInUserList()

  try {
    const firstUserToAdd = (await pool.getUserToBeAddedNextPeriod(0)).toString()
    logger({ firstUserToAdd })
  } catch (error) {
    // ignore (usersToAddNextPeriod array is empty)
  }

  try {
    const firstUserToRemove = (await pool.getUserToBeRemovedNextPeriod(
      0
    )).toString()
    logger({ firstUserToRemove })
  } catch (error) {
    // ignore (usersToRemoveNextPeriod array is empty)
  }

  logCurrentRound(currentStakingRound)
  logNextRound(nextStakingRound)
  logger({ totalUserStake }, { logLevel: 1 })

  logger({
    userCount,
    complianceDataIndex,
    ownerFunds,
    removalIndices,
  })
}

const logIsStaking = async ({ pool, users }) => {
  const userIsStakingList = await Promise.all(
    users.map(user => pool.userIsStaking(user).then(r => r.toString()))
  )

  const userIsStakingNextPeriodList = await Promise.all(
    users.map(user =>
      pool.userIsStakingNextPeriod(user).then(r => r.toString())
    )
  )

  logger({ userIsStakingList, userIsStakingNextPeriodList })
}

const logFirstUsers = async ({ pool, userCount }) => {
  for (let i = 0; i < userCount; i++) {
    const user = await pool.users(i)
    logger({ i, user })
  }
}

const logUserBalancesForFirstPeriods = async ({ pool, users }) => {
  const stakesAtCurrentRound = await Promise.all(
    users.map(user =>
      pool
        .getStakeForUserInCurrentPeriod({ from: user })
        .then(userStake => userStake.toNumber())
    )
  )

  const stakesAtNextRound = await Promise.all(
    users.map(user =>
      pool
        .getAdditionalStakeForUserInNextPeriod({ from: user })
        .then(addedUserStake => addedUserStake.toNumber())
    )
  )

  logger({ stakesAtCurrentRound }, { logLevel: 0 })
  logger({ stakesAtNextRound })
}

const logComplianceDataForFirstPeriods = async ({ pool, users }) => {
  const stakePeriodCount = 4

  for (let i = 0; i < stakePeriodCount; i++) {
    const complianceDataAt = await Promise.all(
      users.map(user =>
        pool.complianceDataAtIndex(i, user).then(r => r.toString())
      )
    )

    logger({ i, complianceDataAt })
  }
}

const approveAndAddUser = ({ pool, stake, token, user }) =>
  token
    .approve(pool.address, stake, { from: user })
    .then(() => pool.addUserInNextPeriod({ from: user }))

const expectUserCountToBe = async ({ expectedUserCount, pool }) => {
  const userCount = await pool.getPoolUserCount()
  expect(userCount).to.be.bignumber.equal(new BN(expectedUserCount))
}

module.exports = {
  approveAndAddUser,
  asyncForEach,
  expectUserCountToBe,
  logComplianceDataForFirstPeriods,
  logFirstUsers,
  logger,
  logIsStaking,
  logPoolState,
  logUserBalancesForFirstPeriods,
}
