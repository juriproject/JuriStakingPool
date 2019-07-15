pragma solidity 0.5.10;

import "./JuriNetworkProxy.sol";
import "./LinkedListLib.sol";

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriBonding is Ownable {
    using LinkedListLib for LinkedListLib.LinkedList;
    using SafeMath for uint256;

    struct AllowedWithdrawalAfter {
        uint256 amount;
        uint256 minRoundIndex;
    }

    JuriNetworkProxy public proxy;
    IERC20 public token;
    uint256 public totalBonded;
    mapping (uint256 => uint256) public totalNodesCount;

    LinkedListLib.LinkedList stakingNodes;

    address constant HEAD = address(0);
    bool constant PREV = false;
    bool constant NEXT = true;

    uint256 constant OFFLINE_SLASH = 0;
    uint256 constant NOT_REVEAL_SLASH = 1;
    uint256 constant INCORRECT_RESULT_SLASH = 2;
    uint256 constant INCORRECT_DISSENT_SLASH = 3;

    mapping (uint256 => mapping (address => uint256)) bondedStakes;
    mapping (uint256 => mapping (uint256 => bool)) hasBeenSlashed;
    mapping (uint256 => mapping (address => bool)) notChangedStakeInRound;
    mapping (address => AllowedWithdrawalAfter) allowedWithdrawalAmounts;

    uint256 public minStakePerNode = 1000e18;

    uint256 public offlinePenalty = 10;
    uint256 public notRevealPenalty = 20;
    uint256 public incorrectResultPenalty = 20;
    uint256 public incorrectDissentPenalty = 100;

    function slashStakeForBeingOffline(address _toSlashNode, address _dissentedUser) public {
        uint256 roundIndex = proxy.roundIndex();

        require(
            !hasBeenSlashed[roundIndex][OFFLINE_SLASH],
            "The node has already been slashed for being offline!"
        );
        hasBeenSlashed[roundIndex][OFFLINE_SLASH] = true;

        bool userWasDissented = proxy.getDissented(roundIndex, _dissentedUser);
        bytes32 commitment = proxy.getUserComplianceDataCommitment(roundIndex, _toSlashNode, _dissentedUser);

        require(
            userWasDissented,
            "The passed user was not dissented!"
        );

        require(
            commitment == 0x0,
            "The passed node was not assigned to passed user!"
        );

        _slashStake(roundIndex, _toSlashNode, msg.sender, offlinePenalty);
    }

    function slashStakeForNotRevealing(address _toSlashNode, address _notRevealedUser) public {
        uint256 roundIndex = proxy.roundIndex();

        require(
            !hasBeenSlashed[roundIndex][NOT_REVEAL_SLASH],
            "The node has already been slashed for not revealing!"
        );
        hasBeenSlashed[roundIndex][NOT_REVEAL_SLASH] = true;

        bytes32 commitment = proxy.getUserComplianceDataCommitment(roundIndex, _toSlashNode, _notRevealedUser);

        require(
            !proxy.getHasRevealed(roundIndex, _toSlashNode),
            "The passed node has revealed his commitment!"
        );
    
        require(
            commitment != 0x0,
            "The passed node was not assigned to passed user!"
        );
        
        _slashStake(roundIndex, _toSlashNode, msg.sender, notRevealPenalty);
    }

    function slashStakeForIncorrectResult(address _toSlashNode, address _incorrectResultUser) public {
        uint256 roundIndex = proxy.roundIndex();

        require(
            !hasBeenSlashed[roundIndex][INCORRECT_RESULT_SLASH],
            "The node has already been slashed for an incorrect result!"
        );
        hasBeenSlashed[roundIndex][INCORRECT_RESULT_SLASH] = true;

        bool givenAnswer = proxy.getGivenNodeResult(roundIndex, _toSlashNode, _incorrectResultUser);
        bool acceptedAnswer = proxy.getUserComplianceData(roundIndex, _incorrectResultUser) > 0;

        require(
            givenAnswer != acceptedAnswer,
            "The passed node did not give an incorrect result!"
        );

        _slashStake(roundIndex, _toSlashNode, msg.sender, incorrectResultPenalty);
    }

    function slashStakeForIncorrectDissenting(address _toSlashNode, address _incorrectDissentUser) public {
        uint256 roundIndex = proxy.roundIndex();

        require(
            !hasBeenSlashed[roundIndex][INCORRECT_DISSENT_SLASH],
            "The node has already been slashed for an incorrect dissent!"
        );
        hasBeenSlashed[roundIndex][INCORRECT_DISSENT_SLASH] = true;

        bool hasDissented = proxy.getHasDissented(roundIndex, _toSlashNode, _incorrectDissentUser);
        bool previousAnswer = proxy.getComplianceDataBeforeDissent(roundIndex, _incorrectDissentUser) > 0;
        bool acceptedAnswer = proxy.getUserComplianceData(roundIndex, _incorrectDissentUser) > 0;

        require(
            hasDissented,
            "The passed node did not dissent to the passed user!"
        );

        require(
            previousAnswer == acceptedAnswer,
            "The dissent from passed node was correct!"
        );

        _slashStake(roundIndex, _toSlashNode, msg.sender, incorrectDissentPenalty);
    }

    function withdrawAllowedStakes() public {
        uint256 roundIndex = proxy.roundIndex();
        AllowedWithdrawalAfter memory allowed = allowedWithdrawalAmounts[msg.sender];

        require(
            allowed.minRoundIndex >= roundIndex,
            "Not yet allowed to withdraw!"
        );

        allowedWithdrawalAmounts[msg.sender] = AllowedWithdrawalAfter(0, 0);
        require(
            token.transferFrom(address(this), msg.sender, allowed.amount),
            "Not enough tokens in bonding contract for withdrawal!"
        );
    }

    function unbondStake(uint256 _amount) public {
        uint256 roundIndex = proxy.roundIndex();
        uint256 nextRoundIndex = proxy.roundIndex() + 1;

        require(
            notChangedStakeInRound[roundIndex][msg.sender],
            "You may only bond or unbond once per round!"
        );
        notChangedStakeInRound[roundIndex][msg.sender] = true;

        uint256 oldNodeStake = bondedStakes[roundIndex][msg.sender];
        uint256 newNodeStake = oldNodeStake.sub(_amount);
        uint256 oldNodeQualityCount = oldNodeStake.div(minStakePerNode);

        require(
            _amount > 0,
            "Please pass an amount above 0!"
        );
        require(
            oldNodeStake >= _amount,
            "You don't have enough stake to unbond!"
        );
        require(
            newNodeStake >= minStakePerNode || newNodeStake == 0,
            "You may only unbond up to the minimum allowance or all stake!"
        );
        
        allowedWithdrawalAmounts[msg.sender] = AllowedWithdrawalAfter(_amount, nextRoundIndex);
        bondedStakes[nextRoundIndex][msg.sender] = newNodeStake;
        totalBonded = totalBonded.sub(_amount);

        uint256 newNodeQualityCount = newNodeStake.div(minStakePerNode);
        uint256 removedNodeQuality = newNodeQualityCount.sub(oldNodeQualityCount);

        uint256 oldNextTotalNodesCount = totalNodesCount[nextRoundIndex];
        totalNodesCount[nextRoundIndex] = oldNextTotalNodesCount.sub(removedNodeQuality);

        if (newNodeStake == 0) {
            stakingNodes.remove(msg.sender);
        }
    }

    function bondStake(uint256 _amount) public {
        uint256 roundIndex = proxy.roundIndex();
        uint256 nextRoundIndex = proxy.roundIndex() + 1;

        require(
            token.transferFrom(msg.sender, address(this), _amount),
            "Not enough tokens for bonding!"
        );
        require(
            notChangedStakeInRound[roundIndex][msg.sender],
            "You may only bond or unbond once per round!"
        );

        notChangedStakeInRound[roundIndex][msg.sender] = true;

        if (bondedStakes[roundIndex][msg.sender] == 0) {
            stakingNodes.insert(HEAD, msg.sender, PREV);
        }

        uint256 oldNodeStake = bondedStakes[roundIndex][msg.sender];
        uint256 newNodeStake = oldNodeStake.add(_amount);
        uint256 oldNodeQualityCount = oldNodeStake.div(minStakePerNode);

        bondedStakes[nextRoundIndex][msg.sender] = newNodeStake;
        totalBonded = totalBonded.add(_amount);

        require(
            newNodeStake >= minStakePerNode,
            "You must bond at least the minimum allowance!"
        );

        uint256 newNodeQualityCount = newNodeStake.div(minStakePerNode);
        uint256 addedNodeQuality = newNodeQualityCount.sub(oldNodeQualityCount);

        uint256 oldNextTotalNodesCount = totalNodesCount[nextRoundIndex];
        totalNodesCount[nextRoundIndex] = oldNextTotalNodesCount.add(addedNodeQuality);
    }

    function getBondedStakeOfNode(
        address _node
    ) public view returns (uint256) {
        uint256 roundIndex = proxy.roundIndex();

        return bondedStakes[roundIndex][_node];
    }

    function getAllStakingNodes() public view returns (address[] memory) {
        uint256 stakingNodesCount = stakingNodes.sizeOf();
        address[] memory stakingNodesList = new address[](stakingNodesCount);

        stakingNodesList[0] = stakingNodes.list[HEAD][NEXT];

        for (uint256 i = 1; i < stakingNodesCount; i++) {
            stakingNodesList[i] = stakingNodes.list[stakingNodesList[i]][NEXT];
        }

        return stakingNodesList;
    }

    function _slashStake(
        uint256 _roundIndex,
        address _from,
        address _to,
        uint256 _penalty
    ) private returns (uint256) {
         uint256 nextRoundIndex = _roundIndex + 1;
        uint256 slashedStake = bondedStakes[_roundIndex][_from].mul(_penalty).div(100);

        bondedStakes[_roundIndex][_from] = bondedStakes[_roundIndex][_from].sub(slashedStake);
        bondedStakes[_roundIndex][_to] = bondedStakes[_roundIndex][_to].add(slashedStake);

        bondedStakes[nextRoundIndex][_from] = bondedStakes[nextRoundIndex][_from].sub(slashedStake);
        bondedStakes[nextRoundIndex][_to] = bondedStakes[nextRoundIndex][_to].add(slashedStake);
    }
}