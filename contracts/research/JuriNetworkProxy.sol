pragma solidity 0.5.8;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriNetworkProxy is Ownable {
    using SafeMath for uint256;

    JuriBonding public bonding;

    mapping (address => bool) public isRegisteredJuriStakingPool;
    mapping (uint256 => address => int256) public userComplianceData;
    mapping (address => uint256 => address => bytes32) public userComplianceDataCommitments;
    mapping (uint256 => address => bytes32) public userWorkoutSignatures;

    mapping (uint256 => address => uint256) public nodeActivityCount;
    mapping (uint256 => uint256) public totalActivityCount;

    uint256 public roundIndex = 0;
    uint256 public startTime = now;
    uint256 public periodLength = 1 weeks;
    uint256 public nodeVerifierCount = k;

    function moveToNextRound() public {
        require(now > startTime.add(roundIndex.mul(periodLength)));
        
        roundIndex++;
    }

    function registerJuriStakingPool(address _poolAddress) public {
        isRegisteredJuriStakingPool[_poolAddress] = true;
    }

    function addWorkoutSignatureForPoolUser(
        address _poolAddress,
        address _user,
        bytes32 _userWorkoutSignature
    ) public {
        // TODO verify _signature, HOW ?

        userWorkoutSignatures[roundIndex][_user] = _userWorkoutSignature;
    }

    function addWasCompliantDataCommitmentsForUsers(
        address[] memory _users,
        bytes32[] memory _wasCompliantDataCommitments
    ) public {
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bool wasCompliantCommitment = _wasCompliantDataCommitments[i];

            if (!dissented[roundIndex][_user]) {
                require(
                    _verifyValidComplianceAddition(user, msg.sender),
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

            require(keccak256(wasCompliant, randomNonce) == commitment);
    
            int256 currentCompliance = userComplianceData[roundIndex][user];
            
            userComplianceData[roundIndex][user] = wasCompliant
                ? currentCompliance + 1
                : currentCompliance - 1;
        }
    }

    function dissentToAcceptedAnswer(address _user) {
        // verify msg.sender is allowed to dissent

        hasDissented[msg.sender][roundIndex][_user] = true;
        dissented[roundIndex][_user] = true;

        // no reading nodes will need to request the user heart rate data
        // and all of them need to run the calculations
    }

    function _increaseActivityCountForNode(
        address _juriNode,
        uint256 _activityCount
    ) {
        nodeActivityCount[roundIndex][msg.sender].add(_activityCount);
        totalActivityCount[roundIndex].add(_activityCount);
    }

    function _decrementActivityCountForNode(address _juriNode) {
        nodeActivityCount[roundIndex][msg.sender]
            = nodeActivityCount[roundIndex][msg.sender].sub(1);

        totalActivityCount[roundIndex] = totalActivityCount[roundIndex].sub(1);
    }

    function _verifyValidComplianceAddition(
        address _user,
        address _juriSenderNode
    ) returns (bool) {

        // two ideas so far:


        // 1) Have a mapping for each weiToken to address, kind of like ERC-721.
        // See below for how the implementaton here would look like.
        //
        // Issue: How to get that mapping? Might be not so straight-forward.

        uint256 totalStaked = bonding.getTotalBonded();
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

        return false;

        // 2) Compute keccak256(userWorkoutSignature, _juriSenderNode)
        // and allow the nodeVerifierCount greatest hashes to add the data.
        //
        // Issue: Front-running? Time-outs?

        uint256 currentHighestHash = _getCurrentHighestHashForUser(_user);
        bytes32 userWorkoutSignature = userWorkoutSignatures[roundIndex][_user];
        uint256 bondedStake = bonding.getBondedStakeOfNode(_juriSenderNode);

        // TODO pass i as parameter
        require(i <= bondedStake);

        uint256 verifierHash
            = uint256(keccak256(userWorkoutSignature, _juriSenderNode, i));

        if (_getAddedHashesForUser.length < nodeVerifierCount
            || verifierHash < currentHighestHash) {
            _addNewVerifierHashForUser(_user, verifierHash);

            // TODO _decrementActivityCountForNode(replacedNode);

            return true;
        }

        return false;
    }
    
}