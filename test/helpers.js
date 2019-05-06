const { expect } = require('chai')
const { BN, time } = require('openzeppelin-test-helpers')

const {
  defaultPeriodLength,
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultMinStakePerUser,
  defaultMaxStakePerUser,
  defaultMaxTotalStake,
  getDefaultJuriAddress,
  defaultUpdateIterationCount,
  ONE_HUNDRED_TOKEN,
  TWO_HUNDRED_TOKEN,
} = require('./defaults')

const ERC20Mintable = artifacts.require('./lib/ERC20Mintable.sol')
const JuriStakingPool = artifacts.require('./JuriStakingPool.sol')

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

const logCurrentRound = (
  {
    juriFees,
    nonCompliancePenalty,
    roundIndex,
    totalPayout,
    totalStakeToSlash,
    updateStaking1Index,
    updateStaking2Index,
    useMaxNonCompliancy,
  },
  { logLevel = 1 } = {}
) => {
  logger('currentRound.roundIndex ' + roundIndex.toString(), {
    logLevel,
  })
  logger('currentRound.updateStaking1Index ' + updateStaking1Index.toString(), {
    logLevel,
  })
  logger('currentRound.updateStaking2Index ' + updateStaking2Index.toString(), {
    logLevel,
  })
  logger('currentRound.totalStakeToSlash: ' + totalStakeToSlash.toString(), {
    logLevel,
  })
  logger(
    'currentRound.nonCompliancePenalty: ' + nonCompliancePenalty.toString(),
    { logLevel }
  )
  logger('currentRound.totalPayout: ' + totalPayout.toString(), {
    logLevel,
  })
  logger('currentRound.useMaxNonCompliancy: ' + useMaxNonCompliancy, {
    logLevel,
  })
  logger('currentRound.juriFees: ' + juriFees.toString(), {
    logLevel,
  })
}

const logPoolState = async (pool, { logLevel = 2 } = {}) => {
  const currentStakingRound = await pool.currentStakingRound()
  const userCount = (await pool.getPoolUserCount()).toString()
  const complianceDataIndex = (await pool.complianceDataIndex()).toString()
  const ownerFunds = (await pool.ownerFunds()).toString()
  const totalUserStake = (await pool.totalUserStake()).toString()
  const removalIndices = await pool.getRemovalIndicesInUserList()

  try {
    const firstUserToAdd = (await pool.getUserToBeAddedNextPeriod(0)).toString()
    logger({ firstUserToAdd }, { logLevel })
  } catch (error) {
    // ignore (usersToAddNextPeriod array is empty)
  }

  try {
    const firstUserToRemove = (await pool.getUserToBeRemovedNextPeriod(
      0
    )).toString()
    logger({ firstUserToRemove }, { logLevel })
  } catch (error) {
    // ignore (usersToRemoveNextPeriod array is empty)
  }

  logCurrentRound(currentStakingRound, { logLevel })
  logger({ totalUserStake }, { logLevel: 1 }, { logLevel })

  logger(
    {
      userCount,
      complianceDataIndex,
      ownerFunds,
      removalIndices,
    },
    { logLevel }
  )
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

const Stages = {
  AWAITING_COMPLIANCE_DATA: new BN(0),
  AWAITING_FIRST_UPDATE: new BN(1),
  AWAITING_SECOND_UPDATE: new BN(2),
}

const deployJuriStakingPool = async ({
  periodLength = defaultPeriodLength,
  feePercentage = defaultFeePercentage,
  compliantGainPercentage = defaultCompliantGainPercentage,
  maxNonCompliantPenaltyPercentage = defaultMaxNonCompliantPenaltyPercentage,
  minStakePerUser = defaultMinStakePerUser,
  maxStakePerUser = defaultMaxStakePerUser,
  maxTotalStake = defaultMaxTotalStake,
  juriAddress = getDefaultJuriAddress(),
  addresses,
} = {}) => {
  const token = await ERC20Mintable.new()
  await Promise.all(addresses.map(user => token.mint(user, TWO_HUNDRED_TOKEN)))

  const startTime = (await time.latest()).add(time.duration.seconds(20))
  const pool = await JuriStakingPool.new(
    token.address,
    startTime,
    periodLength,
    feePercentage,
    compliantGainPercentage,
    maxNonCompliantPenaltyPercentage,
    minStakePerUser,
    maxStakePerUser,
    maxTotalStake,
    juriAddress
  )

  return { pool, token }
}

const initialPoolSetup = async ({ pool, poolUsers, poolStakes, token }) => {
  await token.approve(pool.address, ONE_HUNDRED_TOKEN)
  await pool.addOwnerFunds()

  await asyncForEach({
    array: poolUsers,
    callback: async (user, i) =>
      approveAndAddUser({
        pool,
        stake: poolStakes[i],
        token,
        user,
      }),
  })

  await time.increase(defaultPeriodLength)

  await pool.addWasCompliantDataForUsers(defaultUpdateIterationCount, [])
  await pool.firstUpdateStakeForNextXAmountOfUsers(defaultUpdateIterationCount)
  await pool.secondUpdateStakeForNextXAmountOfUsers(
    defaultUpdateIterationCount,
    []
  )

  logger('************ After first period ************')
  await logPoolState(pool)
}

const runFullComplianceDataAddition = async ({
  complianceData,
  pool,
  poolUsers,
  updateIterationCount,
}) => {
  for (
    let i = new BN(0);
    i.lt(new BN(poolUsers.length));
    i = i.add(updateIterationCount)
  ) {
    await pool.addWasCompliantDataForUsers(updateIterationCount, complianceData)
  }
}

const runFullFirstUpdate = async ({
  pool,
  poolUsers,
  updateIterationCount,
}) => {
  for (
    let i = new BN(0);
    i.lt(new BN(poolUsers.length));
    i = i.add(updateIterationCount)
  ) {
    logger(`************ UPDATE ${i} ************`, { logLevel: 2 })
    logger('************ Before first update ************', { logLevel: 2 })
    await logPoolState(pool, { logLevel: 2 })
    await pool.firstUpdateStakeForNextXAmountOfUsers(updateIterationCount)
    logger('************ After first update ************', { logLevel: 2 })
    await logPoolState(pool, { logLevel: 2 })
    logger(`************ FINISHED UPDATE ${i} ************`, { logLevel: 2 })
  }
}

const runFullSecondUpdate = async ({
  pool,
  poolUsers,
  updateIterationCount,
}) => {
  for (
    let i = new BN(0);
    i.lt(new BN(poolUsers.length));
    i = i.add(updateIterationCount)
  ) {
    const removalIndices = await pool.getRemovalIndicesInUserList()
    await pool.secondUpdateStakeForNextXAmountOfUsers(
      updateIterationCount,
      removalIndices
    )
  }
}

const runFullCompleteRound = async data => {
  await runFullComplianceDataAddition(data)
  await runFullFirstUpdate(data)
  await runFullSecondUpdate(data)
}

module.exports = {
  approveAndAddUser,
  asyncForEach,
  deployJuriStakingPool,
  expectUserCountToBe,
  initialPoolSetup,
  logComplianceDataForFirstPeriods,
  logFirstUsers,
  logger,
  logIsStaking,
  logPoolState,
  logUserBalancesForFirstPeriods,
  runFullCompleteRound,
  runFullComplianceDataAddition,
  runFullFirstUpdate,
  runFullSecondUpdate,
  Stages,
}
