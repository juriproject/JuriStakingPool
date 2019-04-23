const { expect } = require('chai')
const { BN } = require('openzeppelin-test-helpers')

const asyncForEach = async ({ array, callback }) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

const logger = msg => {
  if (process.env.DEBUG === 'true') console.log(msg)
}

const logPoolState = async pool => {
  const currentStakingRound = await pool.currentStakingRound()
  const nextStakingRound = await pool.nextStakingRound()
  const userCount = (await pool.getPoolUserCount()).toString()
  const complianceDataIndex = (await pool.complianceDataIndex()).toString()
  const ownerFunds = (await pool.ownerFunds()).toString()
  const totalUserStake = (await pool.totalUserStake()).toString()

  try {
    const firstUserToAdd = (await pool.usersToAddNextPeriod(0)).toString()
    logger({ firstUserToAdd })
  } catch (error) {
    // ignore (usersToAddNextPeriod array is empty)
  }

  try {
    const firstUserToRemove = (await pool.usersToRemoveNextPeriod(0)).toString()
    logger({ firstUserToRemove })
  } catch (error) {
    // ignore (usersToRemoveNextPeriod array is empty)
  }

  logger({
    currentStakingRound,
    nextStakingRound,
    userCount,
    complianceDataIndex,
    ownerFunds,
    totalUserStake,
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

  logger({ stakesAtCurrentRound, stakesAtNextRound })
}

const logComplianceDataForFirstPeriods = async ({ pool, users }) => {
  const stakePeriodCount = 7

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
