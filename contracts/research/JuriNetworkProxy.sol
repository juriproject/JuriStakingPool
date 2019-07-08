pragma solidity 0.5.10;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";
import "./MaxHeapLibrary.sol";
import "./JuriBonding.sol";

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
        SLASHING_PERIOD,
        MOVE_TO_NEXT_ROUND
    }

    IERC20 public token;
    Stages public currentStage;
    uint256 public lastStageUpdate;

    uint256 public totalJuriFees;

    // TODO times
    uint256 public timeForCommitmentStage = 1 hours;
    uint256 public timeForRevealStage = 1 hours;
    uint256 public timeForDissentStage = 1 hours;
    uint256 public timeForDissentCommitmentStage = 1 hours;
    uint256 public timeForDissentRevealStage = 1 hours;
    uint256 public timeForSlashingStage = 1 hours;

    mapping (uint256 => uint256) public timesForStages;

    constructor() public {
        timesForStages[uint256(Stages.NODES_ADDING_RESULT_COMMITMENTS)] = timeForCommitmentStage;
        timesForStages[uint256(Stages.NODES_ADDING_RESULT_REVEALS)] = timeForRevealStage;
        timesForStages[uint256(Stages.DISSENTING_PERIOD)] = timeForDissentStage;
        timesForStages[uint256(Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS)] = timeForDissentCommitmentStage;
        timesForStages[uint256(Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS)] = timeForDissentRevealStage;
        timesForStages[uint256(Stages.SLASHING_PERIOD)] = timeForSlashingStage;
    }

    /**
     * @dev Reverts if called in incorrect stage.
     */
    modifier atStage(Stages _stage) {
        require(
            currentStage == _stage,
            "Function cannot be called at this time!"
        );

        _;
    }

    modifier checkIfNextStage() {
        if (currentStage == Stages.USER_ADDING_HEART_RATE_DATA && now > startTime.mul(7 days)) {
            _moveToNextStage();
        } else {
            uint256 timeForStage = timesForStages[uint256(currentStage)];

            if (currentStage == Stages.NODES_ADDING_RESULT_COMMITMENTS && now > lastStageUpdate + timeForStage) {
                _moveToNextStage();
            }
        }

        _;
    }

    JuriBonding public bonding;

    address[] public registeredJuriStakingPools;

    mapping (address => bool) public isRegisteredJuriStakingPool;
    mapping (uint256 => mapping (address => int256)) public userComplianceDataBeforeDissents;
    mapping (uint256 => mapping (address => int256)) public userComplianceData;
    mapping (address => mapping(uint256 => bool)) public hasRevealed;
    mapping (address => mapping(uint256 => mapping (address => bool))) public givenNodeResults;
    mapping (address => mapping(uint256 => mapping (address => bytes32))) public userComplianceDataCommitments;
    mapping (uint256 => mapping(address => bytes32)) public userWorkoutSignatures;
    mapping (uint256 => mapping(address => string)) public userHeartRateDataStoragePaths;
    mapping (uint256 => mapping(address => MaxHeapLibrary.heapStruct)) verifierHashesMaxHeaps;

    mapping (uint256 => mapping(address => mapping (address => bool))) public hasDissented;
    mapping (uint256 => mapping(address => bool)) public dissented;
    mapping (uint256 => mapping(address => mapping (address => bool))) public wasAssignedToUser;

    mapping (uint256 => mapping (address => bool)) public haveRetrievedRewards;

    mapping (uint256 => mapping(address => uint256)) public nodeActivityCount;
    mapping (uint256 => uint256) public totalActivityCount;

    address[] public dissentedUsers;

    uint256 public roundIndex = 0;
    uint256 public startTime = now;
    uint256 public periodLength = 1 weeks;
    uint256 public nodeVerifierCount = 1;

    function moveToNextRound() public checkIfNextStage atStage(Stages.MOVE_TO_NEXT_ROUND) {
        roundIndex++;
    
        dissentedUsers = new address[](0);
        nodeVerifierCount = bonding.totalNodesCount(roundIndex).div(3);
        totalJuriFees = token.balanceOf(address(this));

        _moveToNextStage();
    }

    function registerJuriStakingPool(address _poolAddress) public {
        isRegisteredJuriStakingPool[_poolAddress] = true;
    }

    function addHeartRateDateForPoolUser(
        address _user,
        bytes32 _userWorkoutSignature,
        string memory _heartRateDataStoragePath
    ) public checkIfNextStage atStage(Stages.USER_ADDING_HEART_RATE_DATA) {
        // TODO verify signature, HOW ?
        // TODO verify storage path

        userWorkoutSignatures[roundIndex][_user] = _userWorkoutSignature;
        userHeartRateDataStoragePaths[roundIndex][_user] = _heartRateDataStoragePath;
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
    ) public checkIfNextStage atStage(Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS) {
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
    ) public checkIfNextStage atStage(Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS) {
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
        require(
            wasAssignedToUser[roundIndex][_user][msg.sender],
            'You were not assigned to the given user!'
        );

        require(!dissented[roundIndex][_user]);

        userComplianceDataBeforeDissents[roundIndex][_user]
            = userComplianceData[roundIndex][_user];
        hasDissented[roundIndex][msg.sender][_user] = true;
        dissented[roundIndex][_user] = true;

        dissentedUsers.push(_user);
    }

    function _increaseActivityCountForNode(
        address _juriNode,
        uint256 _activityCount
    ) private view {
        nodeActivityCount[roundIndex][_juriNode].add(_activityCount);
        totalActivityCount[roundIndex].add(_activityCount);
    }

    function _decrementActivityCountForNode(address _juriNode) private {
        nodeActivityCount[roundIndex][_juriNode]
            = nodeActivityCount[roundIndex][_juriNode].sub(1);

        totalActivityCount[roundIndex] = totalActivityCount[roundIndex].sub(1);
    }

    function _moveToNextStage() private {
        if (currentStage == Stages.USER_ADDING_HEART_RATE_DATA) {
            currentStage = Stages.NODES_ADDING_RESULT_COMMITMENTS;
        } else if (currentStage == Stages.NODES_ADDING_RESULT_COMMITMENTS) {
            currentStage = Stages.NODES_ADDING_RESULT_REVEALS;
        } else if (currentStage == Stages.NODES_ADDING_RESULT_REVEALS) {
            currentStage = Stages.DISSENTING_PERIOD;
        } else if (currentStage == Stages.DISSENTING_PERIOD) {
            currentStage = Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS;
        } else if (currentStage == Stages.DISSENTS_NODES_ADDING_RESULT_COMMITMENTS) {
            currentStage = Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS;
        } else if (currentStage == Stages.DISSENTS_NODES_ADDING_RESULT_REVEALS) {
            currentStage = Stages.SLASHING_PERIOD;
        } else if (currentStage == Stages.SLASHING_PERIOD) {
            currentStage = Stages.MOVE_TO_NEXT_ROUND;
        } else if (currentStage == Stages.MOVE_TO_NEXT_ROUND) {
            currentStage = Stages.USER_ADDING_HEART_RATE_DATA;
        }

        lastStageUpdate = now;
    }

    function retrieveRoundJuriFees() public checkIfNextStage atStage(Stages.USER_ADDING_HEART_RATE_DATA) {
        require(!haveRetrievedRewards[roundIndex][msg.sender]);

        uint256 activityCount = nodeActivityCount[roundIndex][msg.sender];
        uint256 totalNodeActivityCount = totalActivityCount[roundIndex];
        uint256 activityShare = activityCount.div(totalNodeActivityCount);

        uint256 tokenAmount = totalJuriFees.mul(activityShare);

        haveRetrievedRewards[roundIndex][msg.sender] = true;
        token.transfer(msg.sender, tokenAmount);
    }

    function _addWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments,
        uint256[] memory _proofIndices
    ) private {
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bytes32 wasCompliantCommitment = _wasCompliantDataCommitments[i];
            uint256 proofIndex = _proofIndices[i];

            if (!dissented[roundIndex][user]) {
                require(
                    _verifyValidComplianceAddition(user, msg.sender, proofIndex),
                    'Node not verified to add data!'
                );
            }

            userComplianceDataCommitments[msg.sender][roundIndex][user]
                = wasCompliantCommitment;
        }

        _increaseActivityCountForNode(msg.sender, _users.length);
    }

    function _addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData,
        bytes32[] memory _randomNonces
    ) private {
        require(!hasRevealed[msg.sender][roundIndex]);

        require(_users.length == _wasCompliantData.length);
        require(_users.length == _randomNonces.length);

        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bool wasCompliant = _wasCompliantData[i];
            bytes32 commitment = userComplianceDataCommitments[msg.sender][roundIndex][user];
            bytes32 randomNonce = _randomNonces[i];

            require(keccak256(abi.encodePacked(wasCompliant, randomNonce)) == commitment);
    
            givenNodeResults[msg.sender][roundIndex][user] = wasCompliant;

            int256 currentCompliance = userComplianceData[roundIndex][user];
            
            userComplianceData[roundIndex][user] = wasCompliant
                ? currentCompliance + 1
                : currentCompliance - 1;
        }

        hasRevealed[msg.sender][roundIndex] = true;
    }

    function _verifyValidComplianceAddition(
        address _user,
        address _juriSenderNode,
        uint256 _proofIndex // for second approach
    ) private returns (bool) {

        // two ideas so far:


        // 1) Have a mapping for each weiToken to address, kind of like ERC-721.
        // See below for how the implementaton here would look like.
        //
        // Issue: How to get that mapping? Might be not so straight-forward.

        /* uint256 totalStaked = bonding.getTotalBonded();
        bytes32 userWorkoutSignature = userWorkoutSignatures[roundIndex][_user];
        bytes32 hashedSignature = userWorkoutSignature;

        for (uint256 i = 0; i < nodeVerifierCount; i++) {
            hashedSignature = keccak256(hashedSignature);

            uint256 verifiedWeiToken = hashedSignature % totalStaked;
            address allowedVerifier
                = bonding.getOwnerOfStakedToken(verifiedWeiToken);

            if (allowedVerifier == _juriSenderNode) {
                return true;
            }
        }

        return false; */

        // 2) Compute keccak256(userWorkoutSignature, _juriSenderNode)
        // and allow the nodeVerifierCount greatest hashes to add the data.
        //
        // Issue: Front-running? Time-outs?

        uint256 currentHighestHash = _getCurrentHighestHashForUser(_user);
        bytes32 userWorkoutSignature = userWorkoutSignatures[roundIndex][_user];
        uint256 bondedStake = bonding.getBondedStakeOfNode(_juriSenderNode);

        require(_proofIndex <= bondedStake.div(1e18));

        uint256 verifierHash
            = uint256(keccak256(abi.encodePacked(userWorkoutSignature, _juriSenderNode, _proofIndex)));

        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap = verifierHashesMaxHeaps[roundIndex][_user];

        if (verifierHashesMaxHeap.getLength() < nodeVerifierCount
            || verifierHash < currentHighestHash) {
            address removedNode
                = _addNewVerifierHashForUser(_juriSenderNode, _user, verifierHash);

            _decrementActivityCountForNode(removedNode);

            return true;
        }

        return false;
    }

    function _getCurrentHighestHashForUser(address _user) private view returns (uint256) {
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap = verifierHashesMaxHeaps[roundIndex][_user];

        return verifierHashesMaxHeap.getMax().value;
    }

    function _addNewVerifierHashForUser(
        address _juriSenderNode,
        address _user,
        uint256 _verifierHash
    ) private returns (address) {        
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap = verifierHashesMaxHeaps[roundIndex][_user];
        verifierHashesMaxHeap.insert(_juriSenderNode, _verifierHash);

        MaxHeapLibrary.MaxHeapEntry memory removedEntry = verifierHashesMaxHeap.removeMax();
        address removedNode = removedEntry.node;
                
        wasAssignedToUser[roundIndex][_user][removedNode] = false;
        wasAssignedToUser[roundIndex][_user][_juriSenderNode] = true;

        return removedNode;
    }
}