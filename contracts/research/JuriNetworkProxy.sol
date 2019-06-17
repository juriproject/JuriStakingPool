pragma solidity 0.5.8;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriNetworkProxy is Ownable {
    using SafeMath for uint256;

    mapping (address => bool) public isRegisteredJuriStakingPool;
    mapping (uint256 => address => bool) public userComplianceData;
    mapping (uint256 => address => bytes32) public userWorkoutSignatures;

    mapping (uint256 => address => uint256) public nodeActivityCount;
    mapping (uint256 => uint256) public totalActivityCount;

    uint256 roundIndex = 0;
    uint256 startTime = now;
    uint256 periodLength = 1 weeks;
    uint256 nodeVerifierCount = k;

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

    function addWasCompliantDataForUsers(
        address[] memory _users,
        bool[] memory _wasCompliantData
    ) public {
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            bool wasCompliant = _wasCompliantData[i];

            require(
                _verifyValidComplianceAddition(user, msg.sender),
                'Node not verified to add data!'
            );

            userComplianceData[roundIndex][user] = wasCompliant;
        }

        _increaseActivityCountForNode(msg.sender, _users.length);
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

        uint256 totalStaked = juriTokenStaking.totalStaked();
        bytes32 userWorkoutSignature = userWorkoutSignatures[roundIndex][_user];
        bytes32 hashedSignature = userWorkoutSignature;

        for (uint256 i = 0; i < nodeVerifierCount; i++) {
            hashedSignature = keccak256(hashedSignature);

            uint256 verifiedWeiToken = hashedSignature % totalStaked;
            address allowedVerifier
                = juriTokenStaking.getOwnerOfStakedToken(verifiedWeiToken);

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

        uint256 verifierHash
            = uint256(keccak256(userWorkoutSignature, _juriSenderNode));

        if (_getAddedHashesForUser.length < nodeVerifierCount
            || verifierHash < currentHighestHash) {
            _addNewVerifierHashForUser(_user, verifierHash);

            // TODO _decrementActivityCountForNode(replacedNode);

            return true;
        }

        return false;
    }
    
}