const { expect } = require('chai')
const { BN } = require('openzeppelin-test-helpers')

const { initialPoolSetup, logger, runPoolRound } = require('./helpers')

const {
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
} = require('./defaults')

const itRunsPoolRoundsCorrectly = async ({
  pool,
  token,
  user1,
  user2,
  user3,
  user4,
}) => {
  const poolUsers = [user1, user2, user3, user4]
  const poolStakes = [1000, 1000, 1000, 1000]

  await initialPoolSetup({
    pool,
    poolUsers,
    poolStakes,
    token,
  })

  const complianceData = [
    [false, false, true, true],
    [false, false, true, true],
    [false, false, false, false],
    [true, true, true, true],
  ]
  const poolRounds = 4

  for (let i = 0; i < poolRounds; i++) {
    await runPoolRound({
      complianceData: complianceData[i],
      pool,
      poolUsers,
    })
  }

  const userBalances = await Promise.all(
    poolUsers.map(user => pool.getStakeForUserInCurrentPeriod(user))
  )

  const compliantFactor = new BN(100).add(defaultCompliantGainPercentage)

  const expectedUserBalances = []
  poolUsers.forEach((_, i) => expectedUserBalances.push(new BN(poolStakes[i])))

  for (let j = 0; j < poolRounds; j++) {
    const totalStake = expectedUserBalances.reduce(
      (a, b) => a.add(b),
      new BN(0)
    )

    let stakeToSlash = new BN(0)
    let totalPayout = totalStake.mul(defaultFeePercentage).div(new BN(100))

    poolUsers.forEach((_, i) => {
      if (complianceData[j][i]) {
        const newStake = expectedUserBalances[i]
          .mul(compliantFactor)
          .div(new BN(100))
        const gain = newStake.sub(expectedUserBalances[i])
        totalPayout = totalPayout.add(gain)
      } else {
        stakeToSlash = stakeToSlash.add(expectedUserBalances[i])
      }
    })

    const useMaxNonCompliancy =
      stakeToSlash.eq(new BN(0)) ||
      totalPayout.mul(new BN(100)).div(stakeToSlash) >
        defaultMaxNonCompliantPenaltyPercentage

    const juriFeesForRound = totalStake
      .mul(defaultFeePercentage)
      .div(new BN(100))

    poolUsers.forEach((_, i) => {
      const oldBalance = expectedUserBalances[i]

      if (useMaxNonCompliancy) {
        const nonCompliantFactor = new BN(100).sub(
          new BN(defaultMaxNonCompliantPenaltyPercentage)
        )
        expectedUserBalances[i] = oldBalance
          .mul(complianceData[j][i] ? compliantFactor : nonCompliantFactor)
          .div(new BN(100))
      } else {
        expectedUserBalances[i] = oldBalance
          .mul(stakeToSlash.sub(totalPayout))
          .div(stakeToSlash)
      }

      logger(
        {
          PoolRound: j,
          User: i,
          ExpectedBalance: expectedUserBalances[i].toNumber(),
        },
        { logLevel: 0 }
      )

      const totalStakeAfter = expectedUserBalances.reduce(
        (a, b) => a.add(b),
        new BN(0)
      )

      logger(
        {
          stakeToSlash: stakeToSlash.toString(),
          totalPayout: totalPayout.toString(),
          useMaxNonCompliancy,
          maxNonCompliantFactor: defaultMaxNonCompliantPenaltyPercentage.toString(),
          juriFeesForRound: juriFeesForRound.toString(),
          totalStake: totalStakeAfter.toString(),
        },
        { logLevel: 1 }
      )
    })
  }

  poolUsers.forEach((_, i) =>
    expect(userBalances[i]).to.be.bignumber.equal(expectedUserBalances[i])
  )
}

module.exports = itRunsPoolRoundsCorrectly
