pragma solidity 0.5.10;

import "../lib/ERC20.sol";
import "../lib/Ownable.sol";
import "../lib/SafeMath.sol";

import "./JuriBonding.sol";
import "./JuriNetworkProxy.sol";

contract JuriToken is ERC20, Ownable {
    using SafeMath for uint256;

    JuriNetworkProxy public proxy;
    JuriBonding public bonding;

    uint256 public currentRoundIndex;
    uint256 public inflationChange;
    uint256 public targetBondingRate;
    uint256 public inflation;
    uint256 public currentMintedTokens;
    uint256 public currentMintableTokens;

    mapping (uint256 => mapping (address => bool)) public haveRetrievedRewards;

    function setTargetBondingRate(uint256 _targetBondingRate) public onlyOwner {
        targetBondingRate = _targetBondingRate;
    }

    function setInflationChange(uint256 _inflationChange)
        public
        onlyOwner {
        inflationChange = _inflationChange;
    }

    function setCurrentRewardTokens() public {
        uint256 roundIndex = proxy.roundIndex();
        require(
            roundIndex > currentRoundIndex,
            "The round is not yet finished!"
        );

        currentRoundIndex++;

        _setInflation();

        currentMintableTokens = totalSupply().mul(inflation).div(100);
        currentMintedTokens = 0;
    }

    function retrieveRoundInflationRewards() public {
        require(
            !haveRetrievedRewards[currentRoundIndex][msg.sender],
            "You have already retrieved your rewards for this round!"
        );

        uint256 nodeActivityCount = proxy.getNodeActivityCount(currentRoundIndex, msg.sender);
        uint256 totalActivityCount = proxy.getTotalActivityCount(currentRoundIndex);
        uint256 activityShare = nodeActivityCount.div(totalActivityCount);

        uint256 mintAmount = currentMintableTokens.mul(activityShare);
        currentMintedTokens = currentMintedTokens.add(mintAmount);

        haveRetrievedRewards[currentRoundIndex][msg.sender] = true;
        _mint(msg.sender, mintAmount);
    }

    function _setInflation() private {
        uint256 totalBonded = bonding.totalBonded();
        uint256 currentBondingRate = totalBonded.div(totalSupply());

        if (currentBondingRate < targetBondingRate) {
            inflation = inflation.add(inflationChange);
        } else if (currentBondingRate > targetBondingRate) {
            inflation = inflationChange > inflation
                ? 0 : inflation.sub(inflationChange);
        }
    }
}