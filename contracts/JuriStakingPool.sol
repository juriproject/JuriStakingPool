pragma solidity 0.5.6;

import "./lib/ERC20.sol";
import "./lib/SafeMath.sol";

contract JuriStakingPool {
    using SafeMath for uint256;

    ERC20 public token;

    // Pool definition
    uint256 periodLength;
    uint256 feePercentage;
    uint256 compliantGainPercentage;
    uint256 maxNonCompliantPenaltyPercentage;
    uint256 minStakePerUser;
    uint256 maxStakePerUser;

    // Pool state
    mapping (uint256 => mapping(address => uint256)) stakePerUserAtIndex;
    mapping (uint256 => mapping(address => boolean)) complianceDataAtIndex;

    uint256 currentStakingPeriodIndex;
    uint256 complianceDataIndex;

    constructor(
        ERC20 _token,
        uint256 _periodLength,
        uint256 _feePercentage,
        uint256 _compliantGainPercentage,
        uint256 _maxNonCompliantPenaltyPercentage,
        uint256 _minStakePerUser,
        uint256 _maxStakePerUser
    ) public {
        require(address(_token) != address(0), "Token address must be defined!");
        require(_periodLength > 0, 'Period length cannot be 0!');
        require(_feePercentage > 0, 'Fee percentage cannot be 0!');
        require(
            _compliantGainPercentage > 0,
            'Compliant gain percentage cannot be 0!'
        );
        require(
            _maxNonCompliantPenaltyPercentage > 0,
            'Max non-compliant penalty percentage cannot be 0!'
        );
        require(_minStakePerUser > 0, 'Min stake per user cannot be 0!');
        require(_maxStakePerUser > 0, 'Max stake per user cannot be 0!');

        currentStakingPeriodIndex = 0;
        complianceDataIndex = 0;
        token = _token;
        periodLength = _periodLength;
        feePercentage = _feePercentage;
        compliantGainPercentage = _compliantGainPercentage;
        maxNonCompliantPenaltyPercentage = _maxNonCompliantPenaltyPercentage;
        minStakePerUser = _minStakePerUser;
        maxStakePerUser = _maxStakePerUser;
    }

    function addMoreStakeForNextPeriod() public {
        uint256 addedStakeAmount = token.allowance(msg.sender, address(this));

        require(addedStakeAmount > 0, 'No new token funds approved for staking!');
        require(
            token.transferFrom(msg.sender, address(this), addedStakeAmount),
            'Token transfer failed!'
        );

        stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender] =
            stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender]
            .add(addedStakeAmount);
    }

    function optInForStakingForNextPeriod() public {
        userIsStakingNextPeriod[msg.sender] = true;
    }

    function optOutOfStakingForNextPeriod() public {
        userIsStakingNextPeriod[msg.sender] = false;
    }

    function withdraw(uint256 _amount) public {
        uint256 withdrawnFromNextPeriod = _withdrawFromNextPeriod(_amount);

        if (withdrawnFromNextPeriod < _amount) {
            uint256 withdrawFromCurrentPeriod = _amount.sub(withdrawnFromNextPeriod);
            withdrawFromCurrentPeriod(withdrawFromCurrentPeriod);
        }
        
        require(
            token.transferFrom(address(this), msg.sender, _amount),
            'Token transfer failed!'
        );
    }

    function withdrawOwner() public {}

    function addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliant
    ) public {
        require(
            complianceDataIndex <= currentStakingPeriodIndex,
            'Cannot add compliance data for future periods!'
        );
        require(
            _users.length == _wasCompliant.length,
            'User addresses must match wasCompliant booleans!'
        );
        require(_users.length > 0, 'Must pass new data to add!');

        for (var i = 0; i < _users.length; i++) {
            complianceDataAtIndex[complianceDataIndex][_users[i]] = _wasCompliant[i];
        }

        complianceDataIndex++;
    }

    function firstUpdateStakeForNextXAmountOfUsers() public {
        /*
        - For next X users do:
        - user compliant? -> {
            gain = userStakes[user] * gainPercentageNumber
            userStakes[user] = userStakes[user] + gain
            totalPayout += gain
        }
        - user non-compliant? -> totalStakeToSlash += userStakes[user]
        */
    }

    function secondUpdateStakeForNextXAmountOfUsers() public {
        /*
        - nonCompliancePenalty = min(maxNonCompliancePenalty, totalPayout / totalStakeToSlash) # only set in first iteration / rounding errors?
        - For next X users do:
            - user non-compliant? -> userStakes[user] *= 1 - nonCompliancePenalty

        - lastIteration? -> {
            totalStakeUsedForPayouts = totalStakeToSlash * (1 - nonCompliancePenalty)
            underwriterLiability = max(totalPayout - totalStakeUsedForPayouts, 0)
            checkContractHasSufficientFunds() # check that underwriter has paid enough funds into contract
            resetPoolForNextPeriod()
        }
        */
    }

    function setIterationCountForUpdate() public {}

    function _getNextStakingPeriodIndex() private returns (uint256) {
        return currentStakingPeriodIndex + 1;
    }

    function _withdrawFromCurrentPeriod(uint256 _amount) private {
        stakePerUserAtIndex[currentStakingPeriodIndex] = stakePerUserAtIndex[currentStakingPeriodIndex]
            .sub(_amount);
    }

    function _withdrawFromNextPeriod(uint256 _amount) private returns (uint256) {
        uint256 stakeForNextPeriod = stakePerUserAtIndex
            [_getNextStakingPeriodIndex()]
            [msg.sender];

        if (_amount < stakeForNextPeriod) {
            stakePerUserAtIndex[nextStakingPeriodIndex][msg.sender]
                = stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender]
                .sub(_amount);

            return _amount;
        }

        stakePerUserAtIndex[nextStakingPeriodIndex][msg.sender] = 0;
        return stakeForNextPeriod;
    }
}