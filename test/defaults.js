const { BN, ether, time } = require('openzeppelin-test-helpers')

const ONE_TOKEN = ether('1')
const ONE_HUNDRED_TOKEN = ether('100')
const TWO_HUNDRED_TOKEN = ether('200')

const defaultPeriodLength = time.duration.days(7)
const defaultFeePercentage = new BN(1)
const defaultCompliantGainPercentage = new BN(4)
const defaultMaxNonCompliantPenaltyPercentage = new BN(5)
const defaultMinStakePerUser = new BN(500)
const defaultMaxStakePerUser = ONE_HUNDRED_TOKEN
const defaultMaxTotalStake = TWO_HUNDRED_TOKEN
const defaultUpdateIterationCount = new BN(40)

let defaultJuriAddress

const getDefaultJuriAddress = () => defaultJuriAddress
const setDefaultJuriAddress = juriAddress => (defaultJuriAddress = juriAddress)

module.exports = {
  defaultPeriodLength,
  defaultFeePercentage,
  defaultCompliantGainPercentage,
  defaultMaxNonCompliantPenaltyPercentage,
  defaultMinStakePerUser,
  defaultMaxStakePerUser,
  defaultMaxTotalStake,
  defaultUpdateIterationCount,
  getDefaultJuriAddress,
  setDefaultJuriAddress,
  ONE_TOKEN,
  ONE_HUNDRED_TOKEN,
  TWO_HUNDRED_TOKEN,
}
