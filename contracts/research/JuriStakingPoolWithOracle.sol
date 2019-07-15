pragma solidity 0.5.10;

import "./JuriNetworkProxy.sol";
import "../JuriStakingPool.sol";

contract JuriStakingPoolWithOracle is JuriStakingPool {
    JuriNetworkProxy public proxy;

    /**
     * @dev Add user's compliancy data for current or past periods.
     * @param _updateIterationCount The number defining the max for how much compliance
     * data will be passed in a single function call to prevent out-of-gas errors.
     */
    function checkNewAddedComplianceData(uint256 _updateIterationCount)
        public
        onlyOwner
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        uint256 nextStakingPeriodEndTime = poolDefinition.startTime.add(
            currentStakingRound.roundIndex.mul(poolDefinition.periodLength)
        );
        require(
            now > nextStakingPeriodEndTime,
            "Can only add new data after end of periodLength!"
        );

        require(
            proxy.roundIndex() >= currentStakingRound.roundIndex,
            "The results for the round are not available yet!"
        );

        for (
            uint256 i = currentStakingRound.addComplianceDataIndex;
            i < users.length && i <
                currentStakingRound.addComplianceDataIndex
                    .add(_updateIterationCount);
            i++
        ) {
            address user = users[i];
            bool wasCompliant = proxy.getUserComplianceData(
                currentStakingRound.roundIndex,
                user
            ) > 0;

            complianceDataAtIndex[complianceDataIndex][user] = wasCompliant;
        }

        if (currentStakingRound.addComplianceDataIndex >= users.length) {
            complianceDataIndex++;
            currentStakingRound.stage = Stages.AWAITING_FIRST_UPDATE;
        }
    }
}