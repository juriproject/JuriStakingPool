const itRunsProxyTestsCorrectlyWithUsers = require('./research/JuriNetworkProxy/JuriNetworkProxy.test')
const itRunsBondingTestsCorrectlyWithUsers = require('./research/JuriBonding/JuriBonding.test')

contract('JuriNetworkProxy', accounts => {
  itRunsProxyTestsCorrectlyWithUsers(accounts)
})

contract('JuriBonding', accounts => {
  itRunsBondingTestsCorrectlyWithUsers(accounts)
})
