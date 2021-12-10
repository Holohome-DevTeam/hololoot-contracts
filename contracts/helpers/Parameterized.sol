// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import { Ownable } from "./Ownable.sol";

contract Parameterized is Ownable {
    uint256 internal constant WEEK = 7 days;
    uint256 internal constant MONTH = 30 days;

    struct StakeParameters {
        uint256 value;
        uint256 lastChange;
    }

    /// @notice time to wait for unstake
    StakeParameters public timeToUnstake;

    /// @notice fee for premature unstake
    /// @dev value 1000 = 10%
    StakeParameters public unstakeFee;

    /// @notice reward recalculation period length
    StakeParameters public periodLength;

    function _minusFee(uint256 val) internal view returns (uint256) {
        return val - ((val * unstakeFee.value) / 10000);
    }

    function updateFee(uint256 val) external onlyOwner {
        require(block.timestamp > unstakeFee.lastChange + WEEK, "soon");
        require(val <= 2500, "max fee is 25%");
        unstakeFee.lastChange = block.timestamp;
        unstakeFee.value = val;
    }

    function updateTimeToUnstake(uint256 val) external onlyOwner {
        require(block.timestamp > timeToUnstake.lastChange + WEEK, "soon");
        require(val <= 2 * MONTH, "max delay is 60 days");
        timeToUnstake.lastChange = block.timestamp;
        timeToUnstake.value = val;
    }

    function updatePeriodLength(uint256 val) external onlyOwner {
        require(block.timestamp > periodLength.lastChange + WEEK, "soon");
        require(val >= WEEK, "min period length is 7 days");
        periodLength.lastChange = block.timestamp;
        periodLength.value = val;
    }
}
