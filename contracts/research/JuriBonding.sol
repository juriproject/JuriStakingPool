pragma solidity 0.5.8;

import "./JuriNetworkProxy.sol";

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriBonding is Ownable {
    using SafeMath for uint256;

    JuriNetworkProxy public proxy;
    IERC20 public token;
    uint256 public totalBonded;
    uint256 public totalNodesCount;

    mapping (address => uint256) bondedStakes;

    uint256 public minStakePerNode = 1000e18; // TODO use

    uint256 public notRevealPenalty = 20;
    uint256 public offlinePenalty = 10;
    uint256 public incorrectResultPenalty = 20;
    uint256 public incorrectDissentPenalty = 100;

    // TODO prevent double slashes

    function slashStakeForNotRevealing(address _toSlashNode, address _notRevealedUser) public {
        uint256 roundIndex = proxy.roundIndex();
        bytes32 commitment = proxy.userComplianceDataCommitments(_toSlashNode, roundIndex, _notRevealedUser);

        require(commitment != 0x0 && !proxy.hasRevealed(_toSlashNode, roundIndex));
        
        _slashStake(_toSlashNode, msg.sender, notRevealPenalty);
    }

    function slashStakeForBeingOffline(address _toSlashNode, address _dissentedUser) public {
        uint256 roundIndex = proxy.roundIndex();
        bool userWasDissented = proxy.dissented(roundIndex, _dissentedUser);
        bytes32 commitment = proxy.userComplianceDataCommitments(_toSlashNode, roundIndex, _dissentedUser);

        require(userWasDissented && commitment == 0x0);

        _slashStake(_toSlashNode, msg.sender, offlinePenalty);
    }

    function slashStakeForIncorrectResult(address _toSlashNode, address _incorrectResultUser) public {
        uint256 roundIndex = proxy.roundIndex();

        bool givenAnswer = proxy.givenNodeResults(_toSlashNode, roundIndex, _incorrectResultUser);
        bool acceptedAnswer = proxy.userComplianceData(roundIndex, _incorrectResultUser) > 0;

        require(givenAnswer != acceptedAnswer);

        _slashStake(_toSlashNode, msg.sender, incorrectResultPenalty);
    }

    function slashStakeForIncorrectDissenting(address _toSlashNode, address _incorrectDissentUser) public {
        uint256 roundIndex = proxy.roundIndex();

        bool hasDissented = proxy.hasDissented(roundIndex, _toSlashNode, _incorrectDissentUser);
        bool previousAnswer = proxy.userComplianceDataBeforeDissents(roundIndex, _incorrectDissentUser) > 0;
        bool acceptedAnswer = proxy.userComplianceData(roundIndex, _incorrectDissentUser) > 0;

        require(hasDissented && previousAnswer == acceptedAnswer);

        _slashStake(_toSlashNode, msg.sender, incorrectDissentPenalty);
    }

    function unbondStake(uint256 _amount) public {
        // TODO delay
        require(_amount > 0);
        require(bondedStakes[msg.sender] >= _amount);
        require(token.transferFrom(address(this), msg.sender, _amount));

        uint256 oldNodeQualityCount = bondedStakes[msg.sender].div(minStakePerNode);

        bondedStakes[msg.sender] = bondedStakes[msg.sender].sub(_amount);
        totalBonded = totalBonded.sub(_amount);

        uint256 newNodeQualityCount = bondedStakes[msg.sender].div(minStakePerNode);
        uint256 removedNodeQuality = newNodeQualityCount.sub(oldNodeQualityCount);

        totalNodesCount.sub(removedNodeQuality);
    }

    function bondStake(uint256 _amount) public {
        // TODO delay ?
        require(token.transferFrom(msg.sender, address(this), _amount));

        uint256 oldNodeQualityCount = bondedStakes[msg.sender].div(minStakePerNode);

        bondedStakes[msg.sender] = bondedStakes[msg.sender].add(_amount);
        totalBonded = totalBonded.add(_amount);

        uint256 newNodeQualityCount = bondedStakes[msg.sender].div(minStakePerNode);
        uint256 addedNodeQuality = newNodeQualityCount.sub(oldNodeQualityCount);

        totalNodesCount.add(addedNodeQuality);
    }

    function getBondedStakeOfNode(
        address _node
    ) public view returns (uint256) {
        return bondedStakes[_node];
    }

    function _slashStake(
        address _from,
        address _to,
        uint256 _penalty
    ) private returns (uint256) {
        uint256 slashedStake = bondedStakes[_from].mul(_penalty).div(100);

        bondedStakes[_from] = bondedStakes[_from].sub(slashedStake);
        bondedStakes[_to] = bondedStakes[_to].add(slashedStake);
    }
}