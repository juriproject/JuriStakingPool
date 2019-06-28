pragma solidity 0.5.8;

import "../lib/IERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriBonding is Ownable {
    using SafeMath for uint256;

    IERC20 public token;
    uint256 public totalBonded;
    uint256 public totalNodesCount;

    mapping (address => uint256) bondedStakes;

    uint256 public minStakePerNode = 1000e18; // TODO use

    function slashStakeForNotRevealing() public {
        // verify node did not reveal by looking at proxy
        // re-distribute slashed stake
    }

    function slashStakeForBeingOffline() public {
        // how to verify a node was offline?

        // necessary to slash?
    }

    function slashStakeForIncorrectResult() public {
        // verify node gave an incorrect result by looking at proxy
        // re-distribute slashed stake
    }

    function slashStakeForIncorrectDissenting() public {
        // check proxy.hasDissented[_node][roundIndex][_user]
        // True + new accepted answer was not different from previous?
        // -> slash stake
        // re-distribute slashed stake
    }

    function unbondStake(uint256 _amount) public {
        // TODO delay
        require(_amount > 0);
        require(bondedStakes[msg.sender] >= _amount);
        require(token.transferFrom(address(this), msg.sender, _amount));

        bondedStakes[msg.sender] = bondedStakes[msg.sender].sub(_amount);
        totalBonded = totalBonded.sub(_amount);

        if (bondedStakes[msg.sender] == 0) {
            totalNodesCount--;
        }
    }

    function bondStake(uint256 _amount) public {
        require(token.transferFrom(msg.sender, address(this), _amount));

        bondedStakes[msg.sender] = bondedStakes[msg.sender].add(_amount);
        totalBonded = totalBonded.add(_amount);

        totalNodesCount++;
    }

    function getBondedStakeOfNode(
        address _node
    ) public view returns (uint256) {
        return bondedStakes[_node];
    }
}