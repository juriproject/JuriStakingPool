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
    address[] public usersToAddNextPeriod;
    address[] public usersToRemoveNextPeriod;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier isPoolUser() {
        require(_isInArray(msg.sender, users), 'Only added pool users can use this function!');
        
        _;
    }

     /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier isNotPoolUser() {
        require(!_isInArray(msg.sender, users), 'Only non-members can use this function!');
        
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

    function addUserInNextPeriod(address _user) public isNotPoolUser {
        usersToAddNextPeriod.push(_user);
    }

    function removeUserInNextPeriod() public isPoolUser {
        require(
            !_isInArray(msg.sender, usersToRemoveNextPeriod),
            'User already marked for removal!'
        );

        usersToRemoveNextPeriod.push(msg.sender);

        // TODO withdraw + setFundsMappings to 0?
    }

    function addMoreStakeForNextPeriod() public /* TODO isPoolUser */ {
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

    // TODO restrict access
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
        // require(_wasCompliant.length > 0, 'Must pass new data to add!'); TODO

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

                _updateStakeAtNextPeriod(user, newStake);
            } else {
                currentTotalStakeToSlash = currentTotalStakeToSlash
                    .add(_getCurrentStakeForUser(user));
            }
        }

        updateStakingIndex = updateStakingIndex.add(updateIterationCount);
    }

    function secondUpdateStakeForNextXAmountOfUsers(
        uint256[] memory _removalIndices
    ) public {
        if (updateStaking2Index == 0) {
            // TODO rounding errors?
            currentNonCompliancePenalty = currentTotalStakeToSlash > 0 ? Math.min(
                maxNonCompliantPenaltyPercentage,
                currentTotalPayout.mul(100).div(currentTotalStakeToSlash)
            ) : maxNonCompliantPenaltyPercentage;
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
                _updateStakeAtNextPeriod(user, newStake);
            }
        }

        updateStaking2Index = updateStaking2Index.add(updateIterationCount);

        if (updateStaking2Index >= users.length) {
            // TODO
            // totalStakeUsedForPayouts = currentTotalStakeToSlash.mul(1 - currentNonCompliancePenalty);
            // underwriterLiability = Math.max(currentTotalPayout - totalStakeUsedForPayouts, 0);
            // checkContractHasSufficientFunds(); // check that underwriter has paid enough funds into contract
            _resetPoolForNextPeriod(_removalIndices);
        }
    }

    function setIterationCountForUpdate(
        uint256 _updateIterationCount
    ) public onlyOwner {
        require(_updateIterationCount > 0, 'Please provide an iteration count higher than 0!');

        updateIterationCount = _updateIterationCount;
    }

    function getRemovalIndicesInUserList() public view returns (uint256[] memory) {
        uint256[] memory indices = new uint256[](usersToRemoveNextPeriod.length - 1);

        for (uint256 i = 0; i < usersToRemoveNextPeriod.length; i++) {
            uint256 index = uint256(_getIndexInArray(usersToRemoveNextPeriod[i], users));
            indices[i] = index;
        }

        return indices;
    }

    function getPoolUserCount() public view returns (uint256) {
        return users.length;
    }

    function getStakeForUserInCurrentPeriod() public view returns (uint256) {
        return stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender];
    }

    function getAdditionalStakeForUserInNextPeriod() public view returns (uint256) {
        return stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender];
    }

    /**
     * @dev Returns index of user address in array. If not applicable, returns -1.
     */
    function _getIndexInArray(
        address _user,
        address[] memory _array
    ) private pure returns (int256) {
        for (uint256 i = 0; i < _array.length; i++) {
            if (_array[i] == _user) {
                return int256(i);
            }
        }

        return -1;
    }

    function _removePoolUserAtIndex(uint256 _index) private {
        users[_index] = users[users.length - 1];
        users.length--;
    }

    function _isInArray(
        address _user,
        address[] memory _array
    ) private pure returns (bool) {
        bool isInArray = false;

        for (uint256 i = 0; i < _array.length; i++) {
            if (_array[i] == _user) {
                isInArray = true;
                break;
            }
        }

        return isInArray;
    }

    function _getNextStakingPeriodIndex() private view returns (uint256) {
        return currentStakingPeriodIndex + 1;
    }

    function _getCurrentStakeForUser(
        address _user
    ) private view returns (uint256) {
        return stakePerUserAtIndex[currentStakingPeriodIndex][_user];
    }

    function _updateStakeAtNextPeriod(address _user, uint256 _newStake) private {
        stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user]
            = stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user]
            .add(_newStake);
        stakePerUserAtIndex[currentStakingPeriodIndex][_user] = 0;
    }

    function _withdrawFromCurrentPeriod(uint256 _amount) private {
        uint256 stakeAfterWithdraw = _getCurrentStakeForUser(msg.sender).sub(_amount);

        uint256 lossPercentage = uint256(100).sub(maxNonCompliantPenaltyPercentage);
        uint256 stakeAfterLoss = _getCurrentStakeForUser(msg.sender)
            .mul(lossPercentage).div(100);
        uint256 maxLoss = _getCurrentStakeForUser(msg.sender).sub(stakeAfterLoss);

        require(
            stakeAfterWithdraw >= maxLoss, 
            'Cannot withdraw more than safe staking amount!'
        );

        stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender] = stakeAfterWithdraw;
        
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

    function _addPendingUsers() private {
        for (uint256 i = 0; i < usersToAddNextPeriod.length; i++) {
            users.push(usersToAddNextPeriod[i]);
        }

        delete usersToAddNextPeriod;
    }

    function _removePendingUsers(uint256[] memory _removalIndices) private {
        for (uint256 i = 0; i < usersToRemoveNextPeriod.length; i++) {
            require(
                users[_removalIndices[i]] == usersToRemoveNextPeriod[i],
                'Please pass removal indices according to getRemovalIndicesInUserList()!'
            );

            assert(users.length > 0);

            _removePoolUserAtIndex(_removalIndices[i]);
        }

        delete usersToRemoveNextPeriod;
    }

    function _resetPoolForNextPeriod(uint256[] memory _removalIndices) private {
        currentStakingPeriodIndex++;

        currentTotalStakeToSlash = 0;
        currentNonCompliancePenalty = 0;
        currentTotalPayout = 0;
        updateStakingIndex = 0;
        updateStaking2Index = 0;

        _addPendingUsers();
        _removePendingUsers(_removalIndices);
    }
}