const itRunsBondingTestsCorrectlyWithUsers = require('./research/JuriBonding/JuriBonding.test')
const itRunsProxyTestsCorrectlyWithUsers = require('./research/JuriNetworkProxy/JuriNetworkProxy.test')
const itRunsStakingPoolWithOracleTestsCorrectlyWithUsers = require('./research/JuriStakingPoolWithOracle/JuriStakingPoolWithOracle.test')
const itRunsTokenTestsCorrectlyWithUsers = require('./research/JuriToken/JuriToken.test')

contract('JuriNetworkProxy', accounts => {
  itRunsProxyTestsCorrectlyWithUsers(accounts)
})

contract('JuriBonding', accounts => {
  itRunsBondingTestsCorrectlyWithUsers(accounts)
})

contract('JuriStakingPoolWithOracle', accounts => {
  itRunsStakingPoolWithOracleTestsCorrectlyWithUsers(accounts)
})

contract('JuriToken', accounts => {
  itRunsTokenTestsCorrectlyWithUsers(accounts)
})
