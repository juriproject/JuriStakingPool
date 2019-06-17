pragma solidity 0.5.8;

import "../lib/ERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

contract JuriToken is ERC20 {
    using SafeMath for uint256;

    JuriNetworkProxy proxy;
    JuriTokenBonding bonding;

    uint256 currentRoundIndex;
    uint256 targetInflationChange;
    uint256 targetBondingRate;

    mapping (uint256 => address => bool) haveRetrievedRewards;

    function setTargetBondingRate(uint256 _targetBondingRate) public onlyOwner {
        targetBondingRate = _targetBondingRate;
    }

    function setTargetInflationChange(uint256 _targetInflationChange)
        public
        onlyOwner {
        targetInflationChange = _targetInflationChange;
    }

    function setCurrentRewardTokens() public {
        uint256 roundIndex = proxy.roundIndex();
        require(roundIndex > currentRoundIndex);

        currentRoundIndex++;

        _setInflation();

        currentMintableTokens = totalSupply().mul(inflation).div(100);
        currentMintedTokens = 0;
    }

    function retrieveRoundReward() public {
        require(!haveRetrievedRewards[currentRoundIndex][msg.sender]);

        uint256 nodeActivityCount = proxy.nodeActivityCount(currentRoundIndex, msg.sender);
        uint256 totalActivityCount = proxy.totalActivityCount(currentRoundIndex);
        uint256 activityShare = nodeActivityCount.div(totalActivityCount);

        uint256 mintAmount = currentMintableTokens.mul(activityShare);
        currentMintedTokens = currentMintedTokens.add(mintAmount);

        haveRetrievedRewards[currentRoundIndex][msg.sender] = true;
        _mint(msg.sender, mintAmount);
    }

    function _setInflation() private {
        uint256 totalBonded = bonding.getTotalBonded();
        uint256 currentBondingRate = totalBonded.div(totalSupply());

        if (currentBondingRate < targetBondingRate) {
            inflation = inflation.add(inflationChange);
        } else if (currentBondingRate > targetBondingRate) {
            inflation = inflationChange > inflation
                ? 0 : inflation.sub(inflationChange);
        }
    }
}