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
    uint256 public maxTotalStake;
    address public juriAddress;

    // Pool state
    uint256 public ownerFunds;
    uint256 public totalUserStake;
    uint256 public totalAddedStakeNextPeriod;
    uint256 public totalRemovedStakeNextPeriod;

    mapping (uint256 => mapping(address => uint256)) public stakePerUserAtIndex;
    mapping (uint256 => mapping(address => bool)) public complianceDataAtIndex;
    mapping (uint256 => mapping(address => bool)) public stakeHasBeenUpdatedAtIndex;
    mapping (address => bool) public userIsStakingNextPeriod;
    mapping (address => bool) public userIsStaking;

    uint256 public currentStakingPeriodIndex;
    uint256 public complianceDataIndex;
    uint256 public updateStaking1Index;
    uint256 public updateStaking2Index;
    uint256 public currentTotalStakeToSlash;
    uint256 public currentNonCompliancePenalty;
    uint256 public currentTotalPayout;
    uint256 public juriFeesForRound;

    address[] public users;
    address[] public usersToAddNextPeriod;
    address[] public usersToRemoveNextPeriod;

    Stages public stage;

    enum Stages {
        AWAITING_COMPLIANCE_DATA,
        AWAITING_FIRST_UPDATE,
        AWAITING_SECOND_UPDATE
    }

    /**
     * @dev Throws if called in incorrect stage.
     */
    modifier atStage(Stages _stage) {
        require(
            stage == _stage,
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
        totalAddedStakeNextPeriod = 0;
        currentStakingPeriodIndex = 0;
        currentNonCompliancePenalty = 0;
        complianceDataIndex = 0;
        updateStaking1Index = 0;
        updateStaking2Index = 0;
        currentTotalStakeToSlash = 0;
        currentTotalPayout = 0;
        stage = Stages.AWAITING_COMPLIANCE_DATA;

        token = _token;
        periodLength = _periodLength;
        feePercentage = _feePercentage;
        compliantGainPercentage = _compliantGainPercentage;
        maxNonCompliantPenaltyPercentage = _maxNonCompliantPenaltyPercentage;
        minStakePerUser = _minStakePerUser;
        maxStakePerUser = _maxStakePerUser;
        maxTotalStake  = _maxTotalStake;
        juriAddress = _juriAddress;
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
            addedStakeAmount > minStakePerUser,
            'You need to pass the minStakePerUser to add yourself!'
        );
        require(
            token.transferFrom(msg.sender, address(this), addedStakeAmount),
            'Token transfer failed!'
        );

        stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender] = addedStakeAmount;
        usersToAddNextPeriod.push(msg.sender);

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
            !_isInArray(msg.sender, usersToRemoveNextPeriod),
            'User already marked for removal!'
        );

        usersToRemoveNextPeriod.push(msg.sender);
    }

    /**
     * @dev Add more stake for user once next staking period starts.
     */
    function addMoreStakeForNextPeriod()
        public
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
        /* TODO isPoolUser */
    {
        uint256 stakeInCurrentPeriod = stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender];
        uint256 stakeInNextPeriod = stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender];
        uint256 addedStakeAmount = token.allowance(msg.sender, address(this));
        uint256 newStakeBalanceInNextPeriod = stakeInNextPeriod.add(addedStakeAmount);

        require(addedStakeAmount > 0, 'No new token funds approved for staking!');

        require(
            token.transferFrom(msg.sender, address(this), addedStakeAmount),
            'Token transfer failed!'
        );

        totalAddedStakeNextPeriod = totalAddedStakeNextPeriod.add(addedStakeAmount);
        stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender] = newStakeBalanceInNextPeriod;

        // TODO: nice-to-have would be to keep the max funds possible
        require(
            newStakeBalanceInNextPeriod.add(stakeInCurrentPeriod) <= maxStakePerUser,
            'Cannot add more funds for user, because the max per user is reached!'
        );
        require(
            totalAddedStakeNextPeriod.add(totalUserStake) < maxTotalStake,
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
        userIsStakingNextPeriod[msg.sender] = true;
    }

    /**
     * @dev Opt out of staking for user once next staking period starts.
     */
    function optOutOfStakingForNextPeriod()
        public
        atStage(Stages.AWAITING_COMPLIANCE_DATA)
    {
        userIsStakingNextPeriod[msg.sender] = false;
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
     * @param _wasCompliant The boolean array to indicate compliancy.
     */
    function addWasCompliantDataForUsers( // TODO restrict access
        bool[] memory _wasCompliant
    ) public isJuriNetwork atStage(Stages.AWAITING_COMPLIANCE_DATA) {
        require(
            complianceDataIndex <= currentStakingPeriodIndex,
            'Cannot add compliance data for future periods!'
        );

        // TODO prevent out of gas
        
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
        stage = Stages.AWAITING_FIRST_UPDATE;
    }

    /**
     * @dev First part for updating stakes of users for next X users.
     * @param _updateIterationCount The number defining how many users should
     * be updated in a single function call to prevent out-of-gas errors.
     */
    function firstUpdateStakeForNextXAmountOfUsers(
        uint256 _updateIterationCount
    ) public onlyOwner atStage(Stages.AWAITING_FIRST_UPDATE) {
        for (
            uint256 i = updateStaking1Index;
            i < users.length && i < _updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex[currentStakingPeriodIndex][user];

            if (wasCompliant && userIsStaking[user]) {
                uint256 newStake = _getCurrentStakeForUser(user)
                    .mul(uint256(100).add(compliantGainPercentage))
                    .div(100);
                uint256 gain = newStake.sub(_getCurrentStakeForUser(user));
                currentTotalPayout = currentTotalPayout.add(gain);

                _moveStakeToNextPeriod(user, newStake);
            } else {
                currentTotalStakeToSlash = currentTotalStakeToSlash
                    .add(_getCurrentStakeForUser(user));
            }
        }

        updateStaking1Index = updateStaking1Index.add(_updateIterationCount);

        if (updateStaking1Index >= users.length) {
            stage = Stages.AWAITING_SECOND_UPDATE;
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
    ) public atStage(Stages.AWAITING_SECOND_UPDATE) {
        require(
            _removalIndices.length == usersToRemoveNextPeriod.length,
            "Please pass _removalIndices  by calling `getRemovalIndicesInUserList`!"
        );

        if (updateStaking2Index == 0) {
            // TODO rounding errors! e.g. all non-compliant may result in 
            // currentNonCompliancePenalty of 0.9, rounded down to 0
            // results in underwriter having to pay the juri fees
            currentNonCompliancePenalty = currentTotalStakeToSlash > 0 ? Math.min(
                maxNonCompliantPenaltyPercentage,
                currentTotalPayout.mul(100).div(currentTotalStakeToSlash)
            ) : maxNonCompliantPenaltyPercentage;
        }

        for (
            uint256 i = updateStaking2Index;
            i < users.length && i < _updateIterationCount;
            i++
        ) {
            address user = users[i];
            bool wasCompliant = complianceDataAtIndex[currentStakingPeriodIndex][user];


            if (!wasCompliant && userIsStaking[user]) {
                uint256 newStakePercentage = uint256(100).sub(currentNonCompliancePenalty);
                uint256 newStake = _getCurrentStakeForUser(user)
                    .mul(newStakePercentage).div(100);
                _moveStakeToNextPeriod(user, newStake);
            } else if (!userIsStaking[user]) {
                _moveStakeToNextPeriod(user, _getCurrentStakeForUser(user));
            }

            if (!userIsStakingNextPeriod[user] && userIsStaking[user]) {
                totalRemovedStakeNextPeriod = totalRemovedStakeNextPeriod
                    .add(_getCurrentStakeForUser(user));
                userIsStaking[user] = true;
            } else if (userIsStakingNextPeriod[user] && !userIsStaking[user]) {
                totalAddedStakeNextPeriod = totalAddedStakeNextPeriod
                    .add(_getCurrentStakeForUser(user));
                userIsStaking[user] = false;
            }
        }

        updateStaking2Index = updateStaking2Index.add(_updateIterationCount);

        if (updateStaking2Index >= users.length) {
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
        uint256[] memory indices = new uint256[](usersToRemoveNextPeriod.length);

        for (uint256 i = 0; i < usersToRemoveNextPeriod.length; i++) {
            uint256 index = uint256(
                _getIndexInArray(usersToRemoveNextPeriod[i], users)
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
     * @dev Get the stake for user in current period.
     */
    function getStakeForUserInCurrentPeriod() public view returns (uint256) {
        return stakePerUserAtIndex[currentStakingPeriodIndex][msg.sender];
    }

    /**
     * @dev Get the added stake for user in next period.
     */
    function getAdditionalStakeForUserInNextPeriod() public view returns (uint256) {
        return stakePerUserAtIndex[_getNextStakingPeriodIndex()][msg.sender];
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
        return currentStakingPeriodIndex + 1;
    }

    function _getCurrentStakeForUser(
        address _user
    ) private view returns (uint256) {
        return stakePerUserAtIndex[currentStakingPeriodIndex][_user];
    }

    function _getAddedStakeNextPeriodForUser(
        address _user
    ) private view returns (uint256) {
        return stakePerUserAtIndex
            [_getNextStakingPeriodIndex()]
            [_user];
    }

    function _moveStakeToNextPeriod(address _user, uint256 _newStake) private {    
        stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user]
            = stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user]
            .add(_newStake);
        stakePerUserAtIndex[currentStakingPeriodIndex][_user] = 0;
    }

    function _withdrawFromCurrentPeriod(
        address _user,
        uint256 _amount,
        bool _canWithdrawAll
    ) private {
        uint256 stakeAfterWithdraw = _getCurrentStakeForUser(_user).sub(_amount);

        uint256 lossPercentage = uint256(100).sub(maxNonCompliantPenaltyPercentage);
        uint256 stakeAfterLoss = _getCurrentStakeForUser(_user)
            .mul(lossPercentage).div(100);
        uint256 maxLoss = _getCurrentStakeForUser(_user).sub(stakeAfterLoss);

        require(
            _canWithdrawAll || stakeAfterWithdraw >= maxLoss, 
            'Cannot withdraw more than safe staking amount!'
        );

        stakePerUserAtIndex[currentStakingPeriodIndex][_user] = stakeAfterWithdraw;
    }

    function _withdrawFromNextPeriod(
        address _user,
        uint256 _amount
    ) private returns (uint256) {
        uint256 stakeForNextPeriod = _getAddedStakeNextPeriodForUser(_user);

        if (_amount < stakeForNextPeriod) {
            stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user]
                = stakeForNextPeriod.sub(_amount);

            return _amount;
        }

        stakePerUserAtIndex[_getNextStakingPeriodIndex()][_user] = 0;
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
        for (uint256 i = 0; i < usersToAddNextPeriod.length; i++) {
            address newUser = usersToAddNextPeriod[i];
            users.push(newUser);
            totalUserStake = totalUserStake.add(_getCurrentStakeForUser(newUser));
            userIsStaking[newUser] = userIsStakingNextPeriod[newUser];
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
        uint256 maxPayout = _totalUserStake.mul(uint256(100).add(compliantGainPercentage));
        require(
            ownerFunds > maxPayout,
            'Pool is not sufficiently funded by owner!'
        );
    }

    function _computeJuriFees() private returns (uint256) {
        return totalUserStake.mul(feePercentage).div(100);
    }

    function _handleJuriFees() private {
        totalUserStake = totalUserStake.sub(juriFeesForRound);

        require(
            token.transfer(juriAddress, juriFeesForRound),
            'Juri fees token transfer failed!'
        );
    }

    function _handleUnderwriting() private {
        uint256 slashedStake = currentTotalStakeToSlash
            .mul(uint256(100).sub(currentNonCompliancePenalty))
            .div(100);
        uint256 totalStakeUsedForPayouts = currentTotalStakeToSlash.sub(slashedStake);

        if (currentTotalPayout > totalStakeUsedForPayouts) {
            _fundUserStakesFromOwnerFunds(totalStakeUsedForPayouts);
        }
    }

    function _fundUserStakesFromOwnerFunds(uint256 _totalStakeUsedForPayouts) private {
        uint256 underwriterLiability = currentTotalPayout.sub(_totalStakeUsedForPayouts);
        totalUserStake = totalUserStake.add(underwriterLiability);
        ownerFunds = ownerFunds.sub(underwriterLiability);
    }

    function _resetPoolForNextPeriod(uint256[] memory _removalIndices) private {
        currentStakingPeriodIndex++;

        totalUserStake = totalUserStake.add(totalAddedStakeNextPeriod);
        totalUserStake = totalUserStake.sub(totalRemovedStakeNextPeriod);

        _ensureContractIsFunded(totalUserStake);

        totalAddedStakeNextPeriod = 0;
        totalRemovedStakeNextPeriod = 0;
        currentTotalStakeToSlash = 0;
        currentNonCompliancePenalty = 0;
        updateStaking1Index = 0;
        updateStaking2Index = 0;

        _addPendingUsers();
        _removePendingUsers(_removalIndices);

        // for next round
        stage = Stages.AWAITING_COMPLIANCE_DATA;
        juriFeesForRound = _computeJuriFees(); 
        currentTotalPayout = juriFeesForRound; 
    }
}