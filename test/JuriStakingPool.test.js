const { getGasResults, storeResults } = require('gastracker')

const { setDefaultJuriAddress } = require('./JuriStakingPool/defaults')
const { deployJuriStakingPool } = require('./JuriStakingPool/helpers')
const {
  itCorrectlyAddsOwnerFunds,
  itCorrectlyWithdrawsOwnerFunds,
  itSetsPoolDefinition,
} = require('./JuriStakingPool/simpleFunctionTests')

const itRunsPoolRoundsCorrectly = require('./JuriStakingPool/quickTest.test')
const itAddsNewUsersCorrectly = require('./JuriStakingPool/addUserInNextPeriod.test')
const itRemovesNewUsersCorrectly = require('./JuriStakingPool/removeUserInNextPeriod.test')
const itAddsComplianceDataCorrectly = require('./JuriStakingPool/addComplianceData.test')
const itRunsFirstUpdateCorrectly = require('./JuriStakingPool/firstUpdateStakeForNextXAmountOfUsers.test')
const itRunsSecondUpdateCorrectly = require('./JuriStakingPool/secondUpdateStakeForNextXAmountOfUsers.test')
const itAddsMoreStakeCorrectly = require('./JuriStakingPool/addMoreStake.test')
const itWithdrawsStakeCorrectly = require('./JuriStakingPool/withdraw.test')
const itChecksContraintsOnOptingInOutOfStaking = require('./JuriStakingPool/optInOutOfStaking.test.js')

const itRunsTestsCorrectlyWithUsers = async ({ addresses, addressesToAdd }) => {
  itAddsNewUsersCorrectly({ addresses, addressesToAdd })
  itRemovesNewUsersCorrectly(addresses)
  itAddsComplianceDataCorrectly(addresses)
  itRunsFirstUpdateCorrectly(addresses)
  itRunsSecondUpdateCorrectly(addresses)
  itAddsMoreStakeCorrectly({ addresses, addressesToAdd })
  itWithdrawsStakeCorrectly(addresses)
}

const runQuickTest = ({ owner, user1, user2, user3, user4 }) => {
  describe('when running pool rounds', () => {
    let pool, token

    beforeEach(async () => {
      const deployedContracts = await deployJuriStakingPool({
        addresses: [owner, user1, user2, user3, user4],
      })

      pool = deployedContracts.pool
      token = deployedContracts.token
    })

    it('runs them correctly', async () => {
      await itRunsPoolRoundsCorrectly({
        pool,
        token,
        user1,
        user2,
        user3,
        user4,
      })
    })

    after(() => {
      if (process.env.LOG_GAS === 'true')
        console.log({ gasResults: JSON.stringify(getGasResults()) })
      if (process.env.STORE_GAS_RESULTS === 'true') storeResults('./data.json')
    })
  })
}

const runMediumTest = ({ owner, user1, user2, user3, user4, user5, user6 }) => {
  describe('when running with a few users', () => {
    it('sets poolDefinition', async () => {
      const { pool } = await deployJuriStakingPool({ addresses: [owner] })
      itSetsPoolDefinition(pool)
    })

    const addresses = [owner, user1, user2, user3]

    itRunsTestsCorrectlyWithUsers({
      addresses,
      addressesToAdd: [user4, user5, user6],
    })

    itChecksContraintsOnOptingInOutOfStaking(addresses)
    itCorrectlyAddsOwnerFunds(addresses)
    itCorrectlyWithdrawsOwnerFunds(addresses)

    after(() => {
      if (process.env.LOG_GAS === 'true')
        console.log({ gasResults: JSON.stringify(getGasResults()) })
      if (process.env.STORE_GAS_RESULTS === 'true') storeResults('./data.json')
    })
  })
}

const runFullTest = ({ accounts, owner, user1, user2, user3, user4 }) => {
  describe('when running with a single or many users', () => {
    describe('when running with a single user', () => {
      itRunsTestsCorrectlyWithUsers({
        addresses: [owner, user1],
        addressesToAdd: [user2, user3, user4],
      })
    })

    describe('when running with many users', () => {
      itRunsTestsCorrectlyWithUsers({
        addresses: accounts.slice(0, accounts.length - 3),
        addressesToAdd: accounts.slice(accounts.length - 3),
      })
    })

    after(() => {
      if (process.env.LOG_GAS === 'true')
        console.log({ gasResults: JSON.stringify(getGasResults()) })
      if (process.env.STORE_GAS_RESULTS === 'true') storeResults('./data.json')
    })
  })
}

contract('JuriStakingPool', accounts => {
  const [owner, user1, user2, user3, user4, user5, user6] = accounts

  beforeEach(() => setDefaultJuriAddress(owner))

  switch (process.env.TESTING_MODE) {
    case 'QUICK_TESTING':
      runQuickTest({ owner, user1, user2, user3, user4 })
      break

    case 'FULL_TESTING':
      runFullTest({ accounts, owner, user1, user2, user3, user4 })
      break

    default:
      runMediumTest({ owner, user1, user2, user3, user4, user5, user6 })
      break
  }
})
