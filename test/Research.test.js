const itRunsBondingTestsCorrectlyWithUsers = require('./research/JuriBonding/JuriBonding.test')
const itRunsProxyTestsCorrectlyWithUsers = require('./research/JuriNetworkProxy/JuriNetworkProxy.test')
const itRunsStakingPoolWithOracleTestsCorrectlyWithUsers = require('./research/JuriStakingPoolWithOracle/JuriStakingPoolWithOracle.test')

contract('JuriNetworkProxy', accounts => {
  itRunsProxyTestsCorrectlyWithUsers(accounts)
})

contract('JuriBonding', accounts => {
  itRunsBondingTestsCorrectlyWithUsers(accounts)
})

contract('JuriStakingPoolWithOracle', accounts => {
  itRunsStakingPoolWithOracleTestsCorrectlyWithUsers(accounts)
})
