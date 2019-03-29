pragma solidity 0.5.7;

import "./lib/IERC20.sol";
import "./lib/Math.sol";
import "./lib/Ownable.sol";
import "./lib/SafeMath.sol";

contract JuriStakingPool is Ownable {
    using SafeMath for uint256;

    IERC20 public token;

    // Pool definition
    uint256 public periodLength;
    uint256 public feePercentage;
    uint256 public compliantGainPercentage;
    uint256 public maxNonCompliantPenaltyPercentage;
    uint256 public minStakePerUser;
    uint256 public maxStakePerUser;

    // Pool config
    uint256 public updateIterationCount;

    // TODO make state vars private?
    // Pool state
    mapping (uint256 => mapping(address => uint256)) public stakePerUserAtIndex;
    mapping (uint256 => mapping(address => bool)) public complianceDataAtIndex;
    mapping (uint256 => mapping(address => bool)) public stakeHasBeenUpdatedAtIndex;
    mapping (address => bool) public userIsStakingNextPeriod;

    uint256 public currentStakingPeriodIndex;
    uint256 public complianceDataIndex;
    uint256 public updateStakingIndex;
    uint256 public updateStaking2Index;
    uint256 public currentTotalStakeToSlash;
    uint256 public currentNonCompliancePenalty;
    uint256 public currentTotalPayout;

    address[] public users;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier isPoolUser() {
        bool isUserInPool = false;

        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == msg.sender) {
                isUserInPool = true;
                break;
            }
        }

        require(isUserInPool, 'Only added pool users can use this function!');
        
        _;
    }

    constructor(
        IERC20 _token,
        uint256 _periodLength,
        uint256 _feePercentage,
        uint256 _compliantGainPercentage,
        uint256 _maxNonCompliantPenaltyPercentage,
        uint256 _minStakePerUser,
        uint256 _maxStakePerUser,
        uint256 _updateIterationCount
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
        currentNonCompliancePenalty = 0;
        complianceDataIndex = 0;
        updateStakingIndex = 0;
        updateStaking2Index = 0;
        currentTotalStakeToSlash = 0;
        currentTotalPayout = 0;

        token = _token;
        periodLength = _periodLength;
        feePercentage = _feePercentage;
        compliantGainPercentage = _compliantGainPercentage;
        maxNonCompliantPenaltyPercentage = _maxNonCompliantPenaltyPercentage;
        minStakePerUser = _minStakePerUser;
        maxStakePerUser = _maxStakePerUser;
        updateIterationCount = _updateIterationCount;
    }

    // TODO restrict access, otherwise DOS potential ? -> onlyOwner
    // TODO add users only for next period
    function addUser(address _user) public onlyOwner {
        users.push(_user);
    }

    // TODO remove user only for next period
    function removeUser() public {
        // TODO remove user msg.sender

        // TODO withdraw + setFundsMappings to 0?
    }

    // TODO remove
    function testOnlyIncreaseStakingPeriod() public {
        currentStakingPeriodIndex++;
    }

    function addMoreStakeForNextPeriod() public isPoolUser {
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
            _withdrawFromCurrentPeriod(withdrawFromCurrentPeriod);
        }
        
        require(
            token.transferFrom(address(this), msg.sender, _amount),
            'Token transfer failed!'
        );
    }

    function withdrawOwner() public onlyOwner {}

    function addWasCompliantDataForUsers(
        bool[] memory _wasCompliant
    ) public {
        require(
            complianceDataIndex <= currentStakingPeriodIndex,
            'Cannot add compliance data for future periods!'
        );
        
        // TODO
        // if (complianceDataIndex == currentStakingPeriodIndex) {
        //    require(now > stakingPeriodStartTime + _periodLength - 1 day, '');
        // }

        require(
            users.length == _wasCompliant.length,
            'Compliance data length must match pool users array!'
        );
        require(_wasCompliant.length > 0, 'Must pass new data to add!');

        for (uint256 i = 0; i < users.length; i++) {
            complianceDataAtIndex[complianceDataIndex][users[i]] = _wasCompliant[i];
        }

        complianceDataIndex++;
    }

    // TODO only at Stage after complianceData is updated
    function firstUpdateStakeForNextXAmountOfUsers() public onlyOwner {
        for (
            uint256 i = updateStakingIndex;
            i < users.length && i < updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex[currentStakingPeriodIndex][user];

            if (wasCompliant) {
                uint256 newStake = _getCurrentStakeForUser(user)
                    .mul(uint256(100).add(compliantGainPercentage))
                    .div(100);
                uint256 gain = newStake.sub(_getCurrentStakeForUser(user));
                currentTotalPayout = currentTotalPayout.add(gain);

                _updateCurrentStakeForUser(user, newStake);
            } else {
                currentTotalStakeToSlash = currentTotalStakeToSlash
                    .add(_getCurrentStakeForUser(user));
            }
        }

        updateStakingIndex = updateStakingIndex.add(updateIterationCount);
    }

    function secondUpdateStakeForNextXAmountOfUsers() public {
        if (updateStaking2Index == 0) {
            // TODO rounding errors?
            currentNonCompliancePenalty = Math.min(
                maxNonCompliantPenaltyPercentage,
                currentTotalPayout.mul(100).div(currentTotalStakeToSlash)
            );
        }

        for (
            uint256 i = updateStaking2Index;
            i < users.length && i < updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex[currentStakingPeriodIndex][user];

            if (!wasCompliant) {
                uint256 newStakePercentage = uint256(100).sub(currentNonCompliancePenalty);
                uint256 newStake = _getCurrentStakeForUser(user)
                    .mul(newStakePercentage).div(100);
                _updateCurrentStakeForUser(user, newStake);
            }            
        }

        updateStaking2Index = updateStaking2Index.add(updateIterationCount);

        if (updateStaking2Index == users.length) {
            // TODO
            // totalStakeUsedForPayouts = currentTotalStakeToSlash.mul(1 - currentNonCompliancePenalty);
            // underwriterLiability = Math.max(currentTotalPayout - totalStakeUsedForPayouts, 0);
            // checkContractHasSufficientFunds(); // check that underwriter has paid enough funds into contract
            // resetPoolForNextPeriod();
        }
    }

    function setIterationCountForUpdate(uint256 _updateIterationCount) public onlyOwner {
        require(_updateIterationCount > 0, 'Please provide an iteration count higher than 0!');

        updateIterationCount = _updateIterationCount;
    }

    function _getNextStakingPeriodIndex() private view returns (uint256) {
        return currentStakingPeriodIndex + 1;
    }

    function _getCurrentStakeForUser(address _user) private view returns (uint256) {
        return stakePerUserAtIndex[currentStakingPeriodIndex][_user];
    }

    function _updateCurrentStakeForUser(address _user, uint256 _newStake) private {
        stakePerUserAtIndex[currentStakingPeriodIndex][_user] = _newStake;
    }

    function _withdrawFromCurrentPeriod(uint256 _amount) private {
        stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender] = stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender]
            .sub(_amount);

        // TODO potentialLoss
        /* require(
            stakePerUserAtIndex[currentStakingPeriodIndex] >= potentialLoss, 
            'Cannot withdraw more than safe staking amount!'
        ); */
    }

    function _withdrawFromNextPeriod(uint256 _amount) private returns (uint256) {
        uint256 stakeForNextPeriod = stakePerUserAtIndex
            [_getNextStakingPeriodIndex()]
            [msg.sender];

        if (_amount < stakeForNextPeriod) {
            stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender]
                = stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender]
                .sub(_amount);

            return _amount;
        }

        stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender] = 0;
        return stakeForNextPeriod;
    }
}