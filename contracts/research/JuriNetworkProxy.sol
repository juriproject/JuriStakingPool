pragma solidity 0.5.10;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

import "./JuriBonding.sol";
import "./lib/MaxHeapLibrary.sol";
import "./lib/SkaleFileStorageInterface.sol";

contract JuriNetworkProxy is Ownable {
    using SafeMath for uint256;
    using MaxHeapLibrary for MaxHeapLibrary.heapStruct;

    enum Stages {
        USER_ADDING_HEART_RATE_DATA,
        NODES_ADDING_RESULT_COMMITMENTS,
        NODES_ADDING_RESULT_REVEALS,
        DISSENTING_PERIOD,
        DISSENTS_NODES_ADDING_RESULT_COMMITMENTS,
        DISSENTS_NODES_ADDING_RESULT_REVEALS,
        SLASHING_PERIOD
    }

    struct UserState {
        MaxHeapLibrary.heapStruct verifierHashesMaxHeap;
        int256 complianceDataBeforeDissent;
        int256 userComplianceData;
        bytes32 userWorkoutSignature;
        string userHeartRateDataStoragePath;
        bool dissented;
    }

    struct NodeForUserState {
        bytes32 complianceDataCommitment;
        bool givenNodeResult;
        bool hasDissented;
        bool wasAssignedToUser;
    }

    struct NodeState {
        mapping (address => NodeForUserState) nodeForUserStates;
        bool hasRevealed;
        bool dissentHasRevealed;
        bool hasRetrievedRewards;
        uint256 activityCount;
    }

    struct JuriRound {
        mapping (address => UserState) userStates;
        mapping (address => NodeState) nodeStates;
        uint256 totalActivityCount;
    }

    /**
     * @dev Reverts if called in incorrect stage.
     * @param _stage The allowed stage for the given function.
     */
    modifier atStage(Stages _stage) {
        require(
            currentStage == _stage,
            "Function cannot be called at this time!"
        );

        _;
    }

    modifier checkIfNextStage() {
        uint256 timeForStage = timesForStages[uint256(currentStage)];

        if (currentStage == Stages.SLASHING_PERIOD) {
            if (now.sub(startTime) > roundIndex.mul(timeForStage)) {
                _moveToNextStage();
            }
        } else if (now > lastStageUpdate.add(timeForStage)) {
            _moveToNextStage();
        }

        _;
    }

    JuriBonding public bonding;
    IERC20 public token;
    SkaleFileStorageInterface public skaleFileStorage;

    Stages public currentStage;
    uint256 public roundIndex;
    uint256 public startTime;
    uint256 public lastStageUpdate;
    uint256 public totalJuriFees;
    uint256 public nodeVerifierCount;
    address[] public dissentedUsers;

    mapping (uint256 => uint256) public timesForStages;
    mapping (address => bool) public isRegisteredJuriStakingPool;
    mapping (uint256 => JuriRound) private stateForRound;

    constructor(
        IERC20 _token,
        SkaleFileStorageInterface _skaleFileStorage,
        uint256 _timeForAddingHeartRateData,
        uint256 _timeForCommitmentStage,
        uint256 _timeForRevealStage,
        uint256 _timeForDissentStage,
        uint256 _timeForDissentCommitmentStage,
        uint256 _timeForDissentRevealStage,
        uint256 _timeForSlashingStage,
        uint256 _minStakePerNode,
        uint256 _offlinePenalty,
        uint256 _notRevealPenalty,
        uint256 _incorrectResultPenalty,
        uint256 _incorrectDissentPenalty
    ) public {
        timesForStages[uint256(Stages.USER_ADDING_HEART_RATE_DATA)] = _timeForAddingHeartRateData;
        timesForStages[uint256(Stages.NODES_ADDING_RESULT_COMMITMENTS)] = _timeForCommitmentStage;
        timesForStages[uint256(Stages.NODES_ADDING_RESULT_REVEALS)] = _timeForRevealStage;
        timesForStages[uint256(Stages.DISSENTING_PERIOD)] = _timeForDissentStage;
        timesForStages[uint256(Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS)] = _timeForDissentCommitmentStage;
        timesForStages[uint256(Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS)] = _timeForDissentRevealStage;
        timesForStages[uint256(Stages.SLASHING_PERIOD)] = _timeForSlashingStage;

        bonding = new JuriBonding(
            this,
            _token,
            _minStakePerNode,
            _offlinePenalty,
            _notRevealPenalty,
            _incorrectResultPenalty,
            _incorrectDissentPenalty
        );
        registerJuriStakingPool(address(bonding));

        skaleFileStorage = _skaleFileStorage;
        token = _token;
        currentStage = Stages.USER_ADDING_HEART_RATE_DATA;
        roundIndex = 0;
        startTime = now;
        lastStageUpdate = now;
        totalJuriFees = 0;
        nodeVerifierCount = 1;
    }

    // PUBLIC METHODS

    function registerJuriStakingPool(address _poolAddress) public onlyOwner {
        isRegisteredJuriStakingPool[_poolAddress] = true;
    }

    function removeJuriStakingPool(address _poolAddress) public onlyOwner {
        isRegisteredJuriStakingPool[_poolAddress] = false;
    }

    // TODO remove
    function debugIncreaseRoundIndex() public onlyOwner {
        roundIndex++;
    }

    function moveToNextRound()
        public
        atStage(Stages.SLASHING_PERIOD)
        checkIfNextStage {
        roundIndex++;

        bonding.moveToNextRound(roundIndex);
    
        dissentedUsers = new address[](0);
        nodeVerifierCount = bonding.totalNodesCount(roundIndex); // TODO .div(3);
        totalJuriFees = token.balanceOf(address(this));
    }

    function moveToDissentPeriod()
        public
        atStage(Stages.NODES_ADDING_RESULT_REVEALS)
        checkIfNextStage {
        // do nothing
    }

    function moveToSlashingPeriod()
        public
        atStage(Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS)
        checkIfNextStage {
        // do nothing
    }

    function moveFromDissentToNextPeriod()
        public
        atStage(Stages.DISSENTING_PERIOD)
        checkIfNextStage {
        // do nothing
    }

    function addHeartRateDateForPoolUser(
        address _user, // TODO make msg.sender
        bytes32 _userWorkoutSignature,
        string memory _heartRateDataStoragePath
    ) public checkIfNextStage atStage(Stages.USER_ADDING_HEART_RATE_DATA) {
        // TODO verify signature, HOW ?

        uint8 fileStatus
            = skaleFileStorage.getFileStatus(_heartRateDataStoragePath);
        require(
            fileStatus == 2, // => file exists
            "Invalid storage path passed"
        );

        stateForRound[roundIndex]
            .userStates[_user]
            .userWorkoutSignature = _userWorkoutSignature;

        stateForRound[roundIndex]
            .userStates[_user]
            .userHeartRateDataStoragePath = _heartRateDataStoragePath;
    }

    function addWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments,
        uint256[] memory _proofIndices
    ) public checkIfNextStage atStage(Stages.NODES_ADDING_RESULT_COMMITMENTS) {
        _addWasCompliantDataCommitmentsForUsers(
            _users,
            _wasCompliantDataCommitments,
            _proofIndices
        );
    }

    function addDissentWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments,
        uint256[] memory _proofIndices
    ) public
        checkIfNextStage
        atStage(Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS) {
        _addWasCompliantDataCommitmentsForUsers(
            _users,
            _wasCompliantDataCommitments,
            _proofIndices
        );
    }

    function addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData,
        bytes32[] memory _randomNonces
    ) public checkIfNextStage atStage(Stages.NODES_ADDING_RESULT_REVEALS) {
        require(
            !_getCurrentStateForNode(msg.sender).hasRevealed,
            "You already added the complianceData!"
        );
        stateForRound[roundIndex].nodeStates[msg.sender].hasRevealed = true;

        _addWasCompliantDataForUsers(
            _users,
            _wasCompliantData,
            _randomNonces
        );
    }

    function addDissentWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData,
        bytes32[] memory _randomNonces
    ) public
        checkIfNextStage
        atStage(Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS) {
        require(
            !_getCurrentStateForNode(msg.sender).dissentHasRevealed,
            "You already added the complianceData!"
        );
        stateForRound[roundIndex].nodeStates[msg.sender].dissentHasRevealed = true;

        _addWasCompliantDataForUsers(
            _users,
            _wasCompliantData,
            _randomNonces
        );
    }

    function dissentToAcceptedAnswer(address _user)
        public
        checkIfNextStage
        atStage(Stages.DISSENTING_PERIOD)
    {
        address node = msg.sender;

        require(
            _getCurrentStateForNodeForUser(node, _user).wasAssignedToUser,
            'You were not assigned to the given user!'
        );

        require(
            !_getCurrentStateForUser(_user).dissented,
            "User was already dissented!"
        );

        stateForRound[roundIndex].userStates[_user].complianceDataBeforeDissent
            = _getCurrentStateForUser(_user).userComplianceData;
        // stateForRound[roundIndex].userStates[_user].userComplianceData = 0;
        // (commented out to keep old results)
        stateForRound[roundIndex]
            .userStates[_user]
            .dissented = true;
        stateForRound[roundIndex]
            .nodeStates[node]
            .nodeForUserStates[_user]
            .hasDissented = true;

        dissentedUsers.push(_user);
    }

    function retrieveRoundJuriFees()
        public
        checkIfNextStage
        atStage(Stages.USER_ADDING_HEART_RATE_DATA) {
        address node = msg.sender;
        NodeState memory nodeState = _getCurrentStateForNode(node);

        require(
            !nodeState.hasRetrievedRewards,
            "You already retrieved your rewards this round!"
        );

        uint256 activityCount = nodeState.activityCount;
        uint256 totalNodeActivityCount
            = stateForRound[roundIndex].totalActivityCount;
        uint256 activityShare = activityCount.div(totalNodeActivityCount);
        uint256 tokenAmount = totalJuriFees.mul(activityShare);

        stateForRound[roundIndex].nodeStates[node].hasRetrievedRewards = true;
        token.transfer(node, tokenAmount);
    }

    /// INTERFACE METHODS

    function getDissented(uint256 _roundIndex, address _user)
        public
        view
        returns (bool) {
        return stateForRound[_roundIndex].userStates[_user].dissented;
    }

    function getComplianceDataBeforeDissent(uint256 _roundIndex, address _user)
        public
        view
        returns (int256) {
        return stateForRound[_roundIndex].userStates[_user].complianceDataBeforeDissent;
    }

    function getHasRevealed(uint256 _roundIndex, address _node)
        public
        view
        returns (bool) {
        return stateForRound[_roundIndex].nodeStates[_node].hasRevealed;
    }

    function getNodeActivityCount(uint256 _roundIndex, address _node)
        public
        view
        returns (uint256) {
        return stateForRound[_roundIndex].nodeStates[_node].activityCount;
    }

    function getTotalActivityCount(uint256 _roundIndex)
        public
        view
        returns (uint256) {
        return stateForRound[_roundIndex].totalActivityCount;
    }

    function getUserComplianceDataCommitment(
        uint256 _roundIndex,
        address _node,
        address _user
    ) public view returns (bytes32) {
        return stateForRound[_roundIndex].nodeStates[_node].nodeForUserStates[_user].complianceDataCommitment;
    }

    function getGivenNodeResult(
        uint256 _roundIndex,
        address _node,
        address _user
    ) public view returns (bool) {
        return stateForRound[_roundIndex].nodeStates[_user].nodeForUserStates[_node].givenNodeResult;
    }

    function getHasDissented(uint256 _roundIndex, address _node, address _user)
        public
        view
        returns (bool) {
        return stateForRound[_roundIndex].nodeStates[_node].nodeForUserStates[_user].hasDissented;
    }

    function getUserComplianceData(uint256 _roundIndex, address _user)
        public
        view
        returns (int256) {
        require(
            isRegisteredJuriStakingPool[msg.sender],
            "Pool is not registered to receive new data!"
        );

        return stateForRound[_roundIndex].userStates[_user].userComplianceData;
    }

    /// PRIVATE METHODS

    function _increaseActivityCountForNode(
        address _node,
        uint256 _activityCount
    ) private {
        stateForRound[roundIndex]
            .nodeStates[_node]
            .activityCount = _getCurrentStateForNode(_node)
                .activityCount
                .add(_activityCount);
        stateForRound[roundIndex].totalActivityCount
            = stateForRound[roundIndex].totalActivityCount.add(_activityCount);
    }

    function _decrementActivityCountForNode(address _node) private {
        stateForRound[roundIndex]
            .nodeStates[_node]
            .activityCount
                = _getCurrentStateForNode(_node).activityCount.sub(1);
        stateForRound[roundIndex].totalActivityCount
            = stateForRound[roundIndex].totalActivityCount.sub(1);
    }

    function _moveToNextStage() private {
        if (currentStage == Stages.USER_ADDING_HEART_RATE_DATA) {
            currentStage = Stages.NODES_ADDING_RESULT_COMMITMENTS;
        } else if (currentStage == Stages.NODES_ADDING_RESULT_COMMITMENTS) {
            currentStage = Stages.NODES_ADDING_RESULT_REVEALS;
        } else if (currentStage == Stages.NODES_ADDING_RESULT_REVEALS) {
            currentStage = Stages.DISSENTING_PERIOD;
        } else if (currentStage == Stages.DISSENTING_PERIOD) {
            currentStage = dissentedUsers.length > 0
                ? Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS
                : Stages.SLASHING_PERIOD;
        } else if (currentStage == Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS) {
            currentStage = Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS;
        } else if (currentStage == Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS) {
            currentStage = Stages.SLASHING_PERIOD;
        } else if (currentStage == Stages.SLASHING_PERIOD) {
            currentStage = Stages.USER_ADDING_HEART_RATE_DATA;
        }

        lastStageUpdate = now;
    }

    function _addWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments,
        uint256[] memory _proofIndices
    ) private {
        address node = msg.sender;


        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bytes32 wasCompliantCommitment = _wasCompliantDataCommitments[i];
            uint256 proofIndex = _proofIndices[i];

            require(
                _getCurrentStateForNodeForUser(node, user).complianceDataCommitment == 0x0,
                'Node already added the compliance data for the given user!'
            );

            if (!_getCurrentStateForUser(user).dissented) {
                require(
                    _verifyValidComplianceAddition(user, node, proofIndex),
                    'Node not verified to add data!'
                );
            }

            stateForRound[roundIndex]
                .nodeStates[node]
                .nodeForUserStates[user]
                .complianceDataCommitment
                    = wasCompliantCommitment;
        }

        _increaseActivityCountForNode(node, _users.length);
    }

    function _addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData,
        bytes32[] memory _randomNonces
    ) private {
        address node = msg.sender;

        require(
            _users.length == _wasCompliantData.length,
            "The users length must match the compliance data length!"
        );
        require(
            _users.length == _randomNonces.length,
            "The users length must match the randomNonces data length!"
        );

        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bool wasCompliant = _wasCompliantData[i];
            bytes32 commitment = _getCurrentStateForNodeForUser(node, user)
                .complianceDataCommitment;
            bytes32 randomNonce = _randomNonces[i];
            bytes32 verifierNonceHash = keccak256(
                abi.encodePacked(wasCompliant, randomNonce)
            );
    
            require(
                verifierNonceHash == commitment,
                "The passed random nonce does not match!"
            );

            stateForRound[roundIndex]
                .nodeStates[node]
                .nodeForUserStates[user]
                .givenNodeResult = wasCompliant;
    
            int256 currentCompliance = _getCurrentStateForUser(user)
                .userComplianceData;
            stateForRound[roundIndex].userStates[user].userComplianceData
                = wasCompliant ? currentCompliance + 1 : currentCompliance - 1;
        }
    }

    function _getStateForCurrentRound()
        private
        view
        returns (JuriRound storage) {
        return stateForRound[roundIndex];
    }

    function _getCurrentStateForUser(address _user)
        private
        view
        returns (UserState storage) {
        return stateForRound[roundIndex].userStates[_user];
    }

    function _getCurrentStateForNode(address _node)
        private
        view
        returns (NodeState storage) {
        return stateForRound[roundIndex].nodeStates[_node];
    }

    function _getCurrentStateForNodeForUser(address _node, address _user)
        private
        view
        returns (NodeForUserState storage) {
        return stateForRound[roundIndex].nodeStates[_node].nodeForUserStates[_user];
    }

    function _verifyValidComplianceAddition(
        address _user,
        address _node,
        uint256 _proofIndex
    ) private returns (bool) {
        UserState storage userState = _getCurrentStateForUser(_user);

        uint256 currentHighestHash = _getCurrentHighestHashForUser(_user);
        bytes32 userWorkoutSignature = userState.userWorkoutSignature;
        uint256 bondedStake = bonding.getBondedStakeOfNode(_node);

        require(
            _proofIndex < bondedStake.div(1e18),
            "The proof index must be smaller than the bonded stake per 1e18!"
        );

        uint256 verifierHash = uint256(
            keccak256(abi.encodePacked(userWorkoutSignature, _node, _proofIndex))
        );

        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap
            = userState.verifierHashesMaxHeap;

        if (verifierHashesMaxHeap.getLength() < nodeVerifierCount // TODO count node quality ??
            || verifierHash < currentHighestHash) {
            _addNewVerifierHashForUser(_node, _user, verifierHash);

            if (verifierHashesMaxHeap.getLength() > nodeVerifierCount) {
                _removeMaxVerifierHashForUser(_user);
            }

            return true;
        }

        return false;
    }

    function _getCurrentHighestHashForUser(address _user)
        private
        view
        returns (uint256) {
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap
            = _getCurrentStateForUser(_user).verifierHashesMaxHeap;

        uint256 hashesCount = verifierHashesMaxHeap.getLength();
        uint256 highestHash = hashesCount > 0
            ? verifierHashesMaxHeap.getMax().value
            : 0;

        return highestHash;
    }

    function _removeMaxVerifierHashForUser(
        address _user
    ) private {
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap
            = _getCurrentStateForUser(_user).verifierHashesMaxHeap;
        MaxHeapLibrary.MaxHeapEntry memory removedEntry
            = verifierHashesMaxHeap.removeMax();
        address removedNode = removedEntry.node;

        stateForRound[roundIndex]
            .nodeStates[removedNode]
            .nodeForUserStates[_user]
            .wasAssignedToUser = false;

        _decrementActivityCountForNode(removedNode);
    }

    function _addNewVerifierHashForUser(
        address _node,
        address _user,
        uint256 _verifierHash
    ) private {        
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap
            = _getCurrentStateForUser(_user).verifierHashesMaxHeap;
        verifierHashesMaxHeap.insert(_node, _verifierHash);

        stateForRound[roundIndex]
            .nodeStates[_node]
            .nodeForUserStates[_user]
            .wasAssignedToUser = true;
    }
}



// two ideas for work allocation

// 1) Have a mapping for each weiToken to address, kind of like ERC-721.
// See below for how the implementaton here would look like.
//
// Issue: How to get that mapping? Might be not so straight-forward.

/* uint256 totalStaked = bonding.getTotalBonded();
bytes32 userWorkoutSignature = userWorkoutSignature[roundIndex][_user];
bytes32 hashedSignature = userWorkoutSignature;

for (uint256 i = 0; i < nodeVerifierCount; i++) {
    hashedSignature = keccak256(hashedSignature);

    uint256 verifiedWeiToken = hashedSignature % totalStaked;
    address allowedVerifier
        = bonding.getOwnerOfStakedToken(verifiedWeiToken);

    if (allowedVerifier == _node) {
        return true;
    }
}

return false; */

// 2) Compute keccak256(userWorkoutSignature, _node)
// and allow the nodeVerifierCount greatest hashes to add the data.
//
// Issue: Front-running? Time-outs?