pragma solidity 0.5.7;

import "./lib/IERC20.sol";
import "./lib/Math.sol";
import "./lib/Ownable.sol";
import "./lib/SafeMath.sol";

contract JuriStakingPool is Ownable {
    using SafeMath for uint256;

    enum Stages {
        AWAITING_COMPLIANCE_DATA,
        AWAITING_FIRST_UPDATE,
        AWAITING_SECOND_UPDATE
    }

    struct PoolDefinition {
        uint256 startTime;
        uint256 periodLength;
        uint256 feePercentage;
        uint256 compliantGainPercentage;
        uint256 maxNonCompliantPenaltyPercentage;
        uint256 minStakePerUser;
        uint256 maxStakePerUser;
        uint256 maxTotalStake;
    }

    struct CurrentStakingRound {
        mapping (address => bool) userIsStaking;
        mapping (address => uint256) userStakes;

        uint256 roundIndex;
        Stages stage;

        uint256 addComplianceDataIndex;
        uint256 updateStaking1Index;
        uint256 updateStaking2Index;

        uint256 totalStakeToSlash;
        uint256 nonCompliancePenalty;
        uint256 totalPayout;
        uint256 juriFees;
    }

    struct NextStakingRound {
        mapping (address => bool) userIsStaking;
        mapping (address => uint256) addedUserStakes;
        address[] usersToAdd;
        address[] usersToRemove;
        uint256 totalAddedStake;
        uint256 totalRemovedStake;
    }

    IERC20 public token;
    address public juriAddress;
    PoolDefinition public poolDefinition;

    // Pool state
    CurrentStakingRound public currentStakingRound;
    NextStakingRound public nextStakingRound;

    address[] public users;
    uint256 public ownerFunds;
    uint256 public totalUserStake;

    uint256 public complianceDataIndex;
    mapping (uint256 => mapping(address => bool)) public complianceDataAtIndex;

    event AddedComplianceDataForUser(address user, bool wasCompliant);

    /**
     * @dev Throws if called in incorrect stage.
     */
    modifier atStage(Stages _stage) {
        require(
            currentStakingRound.stage == _stage,
            "Function can't be called at this time!"
        );

        _;
    }

    /**
     * @dev Throws if called by any account other than a pool user.
     */
    modifier isPoolUser() {
        require(
            _isInArray(msg.sender, users),
            'Only added pool users can use this function!'
        );
        
        _;
    }

    /**
     * @dev Throws if called by any pool user account.
     */
    modifier isNotPoolUser() {
        require(
            !_isInArray(msg.sender, users),
            'Only non-members can use this function!'
        );
        
        _;
    }

    /**
     * @dev Throws if called by any account other than the Juri address.
     */
    modifier isJuriNetwork() {
        require(
            msg.sender == juriAddress,
            'Only juriAddress can use this function!'
        );
        
        _;
    }

    /**
     * @dev JuriStakingPool constructor.
     * @param _token The ERC-20 token to be used for staking.
     * @param _periodLength The length of a staking period.
     * @param _feePercentage The fee percentage for the Juri protocol (0-100).
     * @param _compliantGainPercentage The staking gain percentage for
     * compliant users (0-100).
     * @param _maxNonCompliantPenaltyPercentage The maximum penalty percentage
     * for non-compliant users (0-100).
     * @param _minStakePerUser The minimum amount to stake for users.
     * @param _maxStakePerUser The maximum amount to stake for users.
     * @param _maxTotalStake The maximum amount of total stake in the pool.
     * @param _juriAddress The address of the Juri protocol.
     */
    constructor(
        IERC20 _token,
        uint256 _startTime,
        uint256 _periodLength,
        uint256 _feePercentage,
        uint256 _compliantGainPercentage,
        uint256 _maxNonCompliantPenaltyPercentage,
        uint256 _minStakePerUser,
        uint256 _maxStakePerUser,
        uint256 _maxTotalStake,
        address _juriAddress
    ) public {
        require(address(_token) != address(0), "Token address must be defined!");
        require(_startTime > now, 'Start time must be in the future!');
        require(_periodLength > 0, 'Period length cannot be 0!');
        require(
            _feePercentage >= 0 && _feePercentage <= 100,
            'Fee percentage must be a number between 0 and 100!'
        );
        require(
            _compliantGainPercentage >= 0 && _compliantGainPercentage <= 100,
            'Compliant gain percentage must be a number between 0 and 100!'
        );
        require(
            _maxNonCompliantPenaltyPercentage >= 0 && _maxNonCompliantPenaltyPercentage <= 100,
            'Max non-compliant penalty percentage must be a number between 0 and 100!'
        );
        require(_minStakePerUser > 0, 'Min stake per user cannot be 0!');
        require(_maxStakePerUser > 0, 'Max stake per user cannot be 0!');
        require(_maxTotalStake > 0, 'Max stake per user cannot be 0!');
        require(_juriAddress != address(0), 'Juri address cannot be 0!');

        ownerFunds = 0;
        totalUserStake = 0;
        complianceDataIndex = 0;

        _setStakingPeriodVariables(0);

        token = _token;
        juriAddress = _juriAddress;

        poolDefinition = PoolDefinition(
            _startTime,
            _periodLength,
            _feePercentage,
            _compliantGainPercentage,
            _maxNonCompliantPenaltyPercentage,
            _minStakePerUser,
            _maxStakePerUser,
            _maxTotalStake
        );
    }

    /**
     * @dev Add user to pool once next staking period starts.
     */
    function addUserInNextPeriod()
        public
        isNotPoolUser
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        uint256 addedStakeAmount = token.allowance(msg.sender, address(this));

        require(
            addedStakeAmount > poolDefinition.minStakePerUser,
            'You need to pass the minStakePerUser to add yourself!'
        );
        require(
            token.transferFrom(msg.sender, address(this), addedStakeAmount),
            'Token transfer failed!'
        );

        nextStakingRound.addedUserStakes[msg.sender] = addedStakeAmount;
        nextStakingRound.usersToAdd.push(msg.sender);

        optInForStakingForNextPeriod();
    }

    /**
     * @dev Remove user from pool once next staking period starts.
     */
    function removeUserInNextPeriod()
        public
        isPoolUser
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        require(
            !_isInArray(msg.sender, nextStakingRound.usersToRemove),
            'User already marked for removal!'
        );

        nextStakingRound.usersToRemove.push(msg.sender);
    }

    /**
     * @dev Add more stake for user once next staking period starts.
     */
    function addMoreStakeForNextPeriod()
        public
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
        /* TODO isPoolUser */
    {
        uint256 stakeInCurrentPeriod = currentStakingRound.userStakes[msg.sender];
        uint256 stakeInNextPeriod = nextStakingRound.addedUserStakes[msg.sender];
        uint256 addedStakeAmount = token.allowance(msg.sender, address(this));
        uint256 newStakeBalanceInNextPeriod = stakeInNextPeriod.add(addedStakeAmount);

        require(addedStakeAmount > 0, 'No new token funds approved for staking!');

        require(
            token.transferFrom(msg.sender, address(this), addedStakeAmount),
            'Token transfer failed!'
        );

        nextStakingRound.totalAddedStake
            = nextStakingRound.totalAddedStake.add(addedStakeAmount);
        nextStakingRound.addedUserStakes[msg.sender]
            = newStakeBalanceInNextPeriod;

        // TODO: nice-to-have would be to keep the max funds possible
        require(
            newStakeBalanceInNextPeriod.add(stakeInCurrentPeriod) <= poolDefinition.maxStakePerUser,
            'Cannot add more funds for user, because the max per user is reached!'
        );
        require(
            nextStakingRound.totalAddedStake.add(totalUserStake) < poolDefinition.maxTotalStake,
            'Cannot add more funds to pool, because the max in pool is reached!'
        );
    }

    /**
     * @dev Opt in for staking for user once next staking period starts.
     */
    function optInForStakingForNextPeriod()
        public
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        nextStakingRound.userIsStaking[msg.sender] = true;
    }

    /**
     * @dev Opt out of staking for user once next staking period starts.
     */
    function optOutOfStakingForNextPeriod()
        public
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        nextStakingRound.userIsStaking[msg.sender] = false;
    }

    /**
     * @dev Withdraw user stake funds from pool. Use funds added for next period
     * first. Keep enough funds to pay non-compliant penalty if required.
     */
    function withdraw(
        uint256 _amount
    ) public atStage(Stages.AWAITING_COMPLIANCE_DATA) { // TODO enforce minStake
        bool canWithdrawAll = false;
        _withdrawForUser(msg.sender, _amount, canWithdrawAll);
    }

    /**
     * @dev Add owner funds to pool.
     */
    function addOwnerFunds()
        public
        onlyOwner
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        uint256 addedAmount = token.allowance(msg.sender, address(this));

        require(addedAmount > 0, 'No new token funds approved for addition!');
        require(
            token.transferFrom(msg.sender, address(this), addedAmount),
            'Token transfer failed!'
        );
    
        ownerFunds = ownerFunds.add(addedAmount);
    }

    /**
     * @dev Withdraw owner funds from pool.
     * @param _amount The amount to withdraw.
     */
    function withdrawOwnerFunds(
        uint256 _amount
    ) public onlyOwner atStage(Stages.AWAITING_COMPLIANCE_DATA) {
        require(_amount <= ownerFunds, "Can't withdraw more than available!");

        ownerFunds = ownerFunds.sub(_amount);
    }

    /**
     * @dev Add user's compliancy data for current or past periods.
     * @param _updateIterationCount The number defining the max for how much compliance
     * data will be passed in a single function call to prevent out-of-gas errors.
     * @param _wasCompliant The boolean array to indicate compliancy.
     */
    function addWasCompliantDataForUsers(
        uint256 _updateIterationCount,
        bool[] memory _wasCompliant
    )
        public
        isJuriNetwork
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        if (currentStakingRound.addComplianceDataIndex + _updateIterationCount > users.length) {
            require(
                currentStakingRound.addComplianceDataIndex +_wasCompliant.length == users.length,
                'Compliance data length must match pool users array!'
            );
        }
        
        // require(_wasCompliant.length > 0, 'Must pass new data to add!'); TODO
        // (commented out because of first period)

        // Commented out, because currently not supported to add multiple
        // compliance data lists due to stage restriction.
        /* require(
            complianceDataIndex <= currentStakingPeriodIndex,
            'Cannot add compliance data for future periods!'
        ); */
        
        if (complianceDataIndex == currentStakingRound.roundIndex) {
            uint256 nextStakingPeriodEndTime
                = poolDefinition.startTime.add(
                    currentStakingRound.roundIndex.mul(poolDefinition.periodLength)
                );
            require(
                now > nextStakingPeriodEndTime,
                'Can only add new data after end of periodLength!'
            );
        }

        for (
            uint256 i = currentStakingRound.addComplianceDataIndex;
            i < users.length && i < _updateIterationCount;
            i++
        ) {
            complianceDataAtIndex[complianceDataIndex][users[i]] = _wasCompliant[i];
            emit AddedComplianceDataForUser(users[i], _wasCompliant[i]);
        }

        currentStakingRound.addComplianceDataIndex
            = currentStakingRound.addComplianceDataIndex.add(_updateIterationCount);

        if (currentStakingRound.addComplianceDataIndex >= users.length) {
            complianceDataIndex++;
            currentStakingRound.stage = Stages.AWAITING_FIRST_UPDATE;
        }
    }

    /**
     * @dev First part for updating stakes of users for next X users.
     * @param _updateIterationCount The number defining how many users should
     * be updated in a single function call to prevent out-of-gas errors.
     */
    function firstUpdateStakeForNextXAmountOfUsers(
        uint256 _updateIterationCount
    )
        public
        onlyOwner
        atStage(Stages.AWAITING_FIRST_UPDATE)
    {
        for (
            uint256 i = currentStakingRound.updateStaking1Index;
            i < users.length && i < _updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex
                [currentStakingRound.roundIndex]
                [user];

            if (wasCompliant && currentStakingRound.userIsStaking[user]) {
                uint256 newStake = _getCurrentStakeForUser(user)
                    .mul(uint256(100).add(poolDefinition.compliantGainPercentage))
                    .div(100);
                uint256 gain = newStake.sub(_getCurrentStakeForUser(user));
                currentStakingRound.totalPayout
                    = currentStakingRound.totalPayout.add(gain);

                _moveStakeToNextPeriod(user, newStake);
            } else {
                currentStakingRound.totalStakeToSlash
                    = currentStakingRound.totalStakeToSlash
                        .add(_getCurrentStakeForUser(user));
            }
        }

        currentStakingRound.updateStaking1Index
            = currentStakingRound.updateStaking1Index.add(_updateIterationCount);

        if (currentStakingRound.updateStaking1Index >= users.length) {
            currentStakingRound.stage = Stages.AWAITING_SECOND_UPDATE;
        }
    }

    /**
     * @dev Second part for updating stakes of users for next X users.
     * @param _updateIterationCount The number defining how many users should
     * be updated in a single function call to prevent out-of-gas errors.
     * @param _removalIndices Indices for removing users, can be retrieved
     * by calling `getRemovalIndicesInUserList` first.
     */
    function secondUpdateStakeForNextXAmountOfUsers(
        uint256 _updateIterationCount,
        uint256[] memory _removalIndices
    )
        public
        onlyOwner
        atStage(Stages.AWAITING_SECOND_UPDATE)
    {
        require(
            _removalIndices.length == nextStakingRound.usersToRemove.length,
            "Please pass _removalIndices  by calling `getRemovalIndicesInUserList`!"
        );

        if (currentStakingRound.updateStaking2Index == 0) {
            // TODO rounding errors! e.g. all non-compliant may result in 
            // nonCompliancePenalty of 0.9, rounded down to 0
            // results in underwriter having to pay the juri fees
            currentStakingRound.nonCompliancePenalty
                = currentStakingRound.totalStakeToSlash > 0 ? Math.min(
                    poolDefinition.maxNonCompliantPenaltyPercentage,
                    currentStakingRound.totalPayout
                        .mul(100)
                        .div(currentStakingRound.totalStakeToSlash)
                ) : poolDefinition.maxNonCompliantPenaltyPercentage;
        }

        for (
            uint256 i = currentStakingRound.updateStaking2Index;
            i < users.length && i < _updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex
                [currentStakingRound.roundIndex]
                [user];
            uint256 stake = _getCurrentStakeForUser(user);


            if (!wasCompliant && currentStakingRound.userIsStaking[user]) {
                uint256 newStakePercentage = uint256(100)
                    .sub(currentStakingRound.nonCompliancePenalty);
                uint256 newStake = stake
                    .mul(newStakePercentage).div(100);
                _moveStakeToNextPeriod(user, newStake);
            } else if (!currentStakingRound.userIsStaking[user]) {
                _moveStakeToNextPeriod(user, stake);
            }

            if (!nextStakingRound.userIsStaking[user] && currentStakingRound.userIsStaking[user]) {
                nextStakingRound.totalRemovedStake = nextStakingRound.totalRemovedStake
                    .add(stake);
                currentStakingRound.userIsStaking[user] = true;
            } else if (nextStakingRound.userIsStaking[user] && !currentStakingRound.userIsStaking[user]) {
                nextStakingRound.totalAddedStake = nextStakingRound.totalAddedStake
                    .add(stake);
                currentStakingRound.userIsStaking[user] = false;
            }
        }

        currentStakingRound.updateStaking2Index
             = currentStakingRound.updateStaking2Index.add(_updateIterationCount);

        if (currentStakingRound.updateStaking2Index >= users.length) {
            _handleJuriFees();
            _handleUnderwriting();
            _resetPoolForNextPeriod(_removalIndices);
        }
    }

    /**
     * @dev Set new Juri address.
     * @param _newJuriAddress The new Juri address to be stored.
     */
    function setJuriAddress(address _newJuriAddress) public isJuriNetwork {
        require(_newJuriAddress != address(0), 'New Juri address cannot be 0!');

        juriAddress = _newJuriAddress;
    }

    /**
     * @dev Retrieve removal indices indicating the positions in user array of
     * users to be removed before next staking period starts, to be used before
     * calling `secondUpdateStakeForNextXAmountOfUsers`.
     */
    function getRemovalIndicesInUserList() public view returns (uint256[] memory) {
        uint256[] memory indices = new uint256[](nextStakingRound.usersToRemove.length);

        for (uint256 i = 0; i < nextStakingRound.usersToRemove.length; i++) {
            uint256 index = uint256(
                _getIndexInArray(nextStakingRound.usersToRemove[i], users)
            );
            indices[i] = index;
        }

        return indices;
    }

    /**
     * @dev Get the total pool user count.
     */
    function getPoolUserCount() public view returns (uint256) {
        return users.length;
    }

    /**
     * @dev Get the stake for calling user in current period.
     */
    function getStakeForUserInCurrentPeriod() public view returns (uint256) {
        return _getCurrentStakeForUser(msg.sender);
    }

    /**
     * @dev Get the added stake for calling user in next period.
     */
    function getAdditionalStakeForUserInNextPeriod() public view returns (uint256) {
        return _getAddedStakeNextPeriodForUser(msg.sender);
    }

    /**
     * @dev Returns index of user address in array. If not found, returns -1.
     * @param _user The user to be searched in array.
     * @param _array The array to be used.
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

    /**
     * @dev Returns if array contains at least one instance of user.
     * @param _user The user to be searched in array.
     * @param _array The array to be used.
     */
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
        return currentStakingRound.roundIndex + 1;
    }

    function _getCurrentStakeForUser(
        address _user
    ) private view returns (uint256) {
        return currentStakingRound.userStakes[_user];
    }

    function _getAddedStakeNextPeriodForUser(
        address _user
    ) private view returns (uint256) {
        return nextStakingRound.addedUserStakes[_user];
    }

    function _moveStakeToNextPeriod(address _user, uint256 _newStake) private {    
        currentStakingRound.userStakes[_user]
            = nextStakingRound.addedUserStakes[_user].add(_newStake);
        nextStakingRound.addedUserStakes[_user] = 0;
    }

    function _withdrawFromCurrentPeriod(
        address _user,
        uint256 _amount,
        bool _canWithdrawAll
    ) private {
        uint256 stakeAfterWithdraw = _getCurrentStakeForUser(_user).sub(_amount);

        uint256 lossPercentage = uint256(100)
            .sub(poolDefinition.maxNonCompliantPenaltyPercentage);
        uint256 stakeAfterLoss = _getCurrentStakeForUser(_user)
            .mul(lossPercentage).div(100);
        uint256 maxLoss = _getCurrentStakeForUser(_user).sub(stakeAfterLoss);

        require(
            _canWithdrawAll || stakeAfterWithdraw >= maxLoss, 
            'Cannot withdraw more than safe staking amount!'
        );

        currentStakingRound.userStakes[_user] = stakeAfterWithdraw;
    }

    function _withdrawFromNextPeriod(
        address _user,
        uint256 _amount
    ) private returns (uint256) {
        uint256 stakeForNextPeriod = _getAddedStakeNextPeriodForUser(_user);

        if (_amount < stakeForNextPeriod) {
            nextStakingRound.addedUserStakes[_user]
                = stakeForNextPeriod.sub(_amount);

            return _amount;
        }

        nextStakingRound.addedUserStakes[_user] = 0;
        return stakeForNextPeriod;
    }

    function _withdrawForUser(
        address _user,
        uint256 _amount,
        bool _canWithdrawAll
    ) public {
        uint256 withdrawnFromNextPeriod = _withdrawFromNextPeriod(_user, _amount);

        if (withdrawnFromNextPeriod < _amount) {
            uint256 withdrawFromCurrentPeriod = _amount.sub(withdrawnFromNextPeriod);
            _withdrawFromCurrentPeriod(_user, withdrawFromCurrentPeriod, _canWithdrawAll);
        }
        
        require(
            token.transfer(_user, _amount),
            'Token transfer failed!'
        );
    }

    function _addPendingUsers() private {
        for (uint256 i = 0; i < nextStakingRound.usersToAdd.length; i++) {
            address newUser = nextStakingRound.usersToAdd[i];

            users.push(newUser);
            _moveStakeToNextPeriod(newUser, 0);

            totalUserStake = totalUserStake.add(_getCurrentStakeForUser(newUser));
            currentStakingRound.userIsStaking[newUser] = nextStakingRound.userIsStaking[newUser];
        }
    }

    function _removePendingUsers(uint256[] memory _removalIndices) private {
        for (uint256 i = 0; i < nextStakingRound.usersToRemove.length; i++) {
            require(
                users[_removalIndices[i]] == nextStakingRound.usersToRemove[i],
                'Please pass removal indices according to getRemovalIndicesInUserList()!'
            );

            assert(users.length > 0);

            _removePoolUserAtIndex(_removalIndices[i]);
        }
    }

    function _removePoolUserAtIndex(uint256 _index) private {
        address userToRemove = users[_index];
        totalUserStake = totalUserStake
            .sub(_getCurrentStakeForUser(userToRemove));

        uint256 userBalance = _getCurrentStakeForUser(userToRemove)
            .add(_getAddedStakeNextPeriodForUser(userToRemove));
        bool canWithdrawAll = true;
        _withdrawForUser(userToRemove, userBalance, canWithdrawAll);

        users[_index] = users[users.length - 1]; // changes order in users!
        users.length--;
    }

    function _ensureContractIsFunded(uint256 _totalUserStake) private view {
        uint256 maxPayout = _totalUserStake.mul(
            uint256(100).add(poolDefinition.compliantGainPercentage)
        );
        require(
            ownerFunds > maxPayout,
            'Pool is not sufficiently funded by owner!'
        );
    }

    function _computeJuriFees() private returns (uint256) {
        return totalUserStake.mul(poolDefinition.feePercentage).div(100);
    }

    function _handleJuriFees() private {
        totalUserStake = totalUserStake.sub(currentStakingRound.juriFees);

        require(
            token.transfer(juriAddress, currentStakingRound.juriFees),
            'Juri fees token transfer failed!'
        );
    }

    function _handleUnderwriting() private {
        uint256 slashedStake = currentStakingRound.totalStakeToSlash
            .mul(uint256(100).sub(currentStakingRound.nonCompliancePenalty))
            .div(100);
        uint256 totalStakeUsedForPayouts = currentStakingRound.totalStakeToSlash.sub(slashedStake);

        if (currentStakingRound.totalPayout > totalStakeUsedForPayouts) {
            _fundUserStakesFromOwnerFunds(totalStakeUsedForPayouts);
        }
    }

    function _fundUserStakesFromOwnerFunds(uint256 _totalStakeUsedForPayouts) private {
        uint256 underwriterLiability = currentStakingRound.totalPayout
            .sub(_totalStakeUsedForPayouts);
        totalUserStake = totalUserStake.add(underwriterLiability);
        ownerFunds = ownerFunds.sub(underwriterLiability);
    }

    function _setStakingPeriodVariables(uint256 _roundIndex) private {
        currentStakingRound = CurrentStakingRound(
            _roundIndex, Stages.AWAITING_COMPLIANCE_DATA, 0, 0, 0, 0, 0, 0, 0
        );

        nextStakingRound = NextStakingRound(
            new address[](0),
            new address[](0),
            0,
            0
        );
    }

    function _resetPoolForNextPeriod(uint256[] memory _removalIndices) private {
        totalUserStake = totalUserStake.add(nextStakingRound.totalAddedStake);
        totalUserStake = totalUserStake.sub(nextStakingRound.totalRemovedStake);

        _ensureContractIsFunded(totalUserStake);

        _addPendingUsers();
        _removePendingUsers(_removalIndices);
        _setStakingPeriodVariables(currentStakingRound.roundIndex + 1);

        // for next round
        currentStakingRound.juriFees = _computeJuriFees();
        currentStakingRound.totalPayout
             = currentStakingRound.juriFees;
    }
}