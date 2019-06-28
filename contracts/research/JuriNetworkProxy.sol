pragma solidity 0.5.8;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";
import "./MaxHeapLibrary.sol";
import "./JuriBonding.sol";

contract JuriNetworkProxy is Ownable {
    using SafeMath for uint256;
    using MaxHeapLibrary for MaxHeapLibrary.heapStruct;

    struct MaxHeapEntry {
        address node;
        uint256 verifierHash;
    }

    JuriBonding public bonding;

    address[] public registeredJuriStakingPools;

    mapping (address => bool) public isRegisteredJuriStakingPool;
    mapping (uint256 => mapping (address => int256)) public userComplianceData;
    mapping (address => mapping(uint256 => mapping (address => bytes32))) public userComplianceDataCommitments;
    mapping (uint256 => mapping(address => bytes32)) public userWorkoutSignatures;
    mapping (uint256 => mapping(address => string)) public userHeartRateDataStoragePaths;
    mapping (uint256 => mapping(address => MaxHeapLibrary.heapStruct)) verifierHashesMaxHeaps;


    mapping (uint256 => mapping(address => mapping (address => bool))) hasDissented;
    mapping (uint256 => mapping(address => bool)) dissented;
    mapping (uint256 => mapping(address => mapping (address => bool))) wasAssignedToUser;

    mapping (uint256 => mapping(address => uint256)) public nodeActivityCount;
    mapping (uint256 => uint256) public totalActivityCount;

    address[] public dissentedUsers;

    uint256 public roundIndex = 0;
    uint256 public startTime = now;
    uint256 public periodLength = 1 weeks;
    uint256 public nodeVerifierCount = 1;

    function moveToNextRound() public {
        require(now > startTime.add(roundIndex.mul(periodLength)));

        dissentedUsers = new address[](0);
        nodeVerifierCount = bonding.totalNodesCount().div(3);
        
        roundIndex++;
    }

    function registerJuriStakingPool(address _poolAddress) public {
        isRegisteredJuriStakingPool[_poolAddress] = true;
    }

    function addHeartRateDateForPoolUser(
        address _user,
        bytes32 _userWorkoutSignature,
        string memory _heartRateDataStoragePath
    ) public {
        // TODO verify signature, HOW ?
        // TODO verify storage path

        userWorkoutSignatures[roundIndex][_user] = _userWorkoutSignature;
        userHeartRateDataStoragePaths[roundIndex][_user] = _heartRateDataStoragePath;
    }

    function addWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments,
        uint256[] memory _proofIndices
    ) public {
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

    function addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData,
        bytes32[] memory _randomNonces
    ) public {
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bool wasCompliant = _wasCompliantData[i];
            bytes32 commitment = userComplianceDataCommitments[msg.sender][roundIndex][user];
            bytes32 randomNonce = _randomNonces[i];

            require(keccak256(abi.encodePacked(wasCompliant, randomNonce)) == commitment);
    
            int256 currentCompliance = userComplianceData[roundIndex][user];
            
            userComplianceData[roundIndex][user] = wasCompliant
                ? currentCompliance + 1
                : currentCompliance - 1;
        }
    }

    function dissentToAcceptedAnswer(address _user) public {
        require(
            wasAssignedToUser[roundIndex][_user][msg.sender],
            'You were not assigned to the given user!'
        );

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
                = _addNewVerifierHashForUser(_juriSenderNode, _user); //, verifierHash);

            _decrementActivityCountForNode(removedNode);

            return true;
        }

        return false;
    }

    function _getCurrentHighestHashForUser(address _user) private view returns (uint256) {
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap = verifierHashesMaxHeaps[roundIndex][_user];

        return verifierHashesMaxHeap.getMax();
    }

    function _addNewVerifierHashForUser(
        address _juriSenderNode,
        address _user
        // uint256 _verifierHash
    ) private returns (address) {

        // TODO enable MaxHeapEntry for MaxHeapLibrary

        /*
        MaxHeapLibrary.heapStruct storage verifierHashesMaxHeap = verifierHashesMaxHeaps[roundIndex][_user];
        MaxHeapEntry memory entry = MaxHeapEntry(_juriSenderNode, _verifierHash);

        MaxHeapEntry memory removedEntry = verifierHashesMaxHeap.insert(entry);
        address removedNode = removedEntry.juriNode;
        */

        address removedNode = address(0);
        
        wasAssignedToUser[roundIndex][_user][removedNode] = false;
        wasAssignedToUser[roundIndex][_user][_juriSenderNode] = true;

        return removedNode;
    }
}