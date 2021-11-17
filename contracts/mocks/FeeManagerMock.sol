// SPDX-License-Identifier: MIT

/* solhint-disable no-empty-blocks */
pragma solidity 0.8.6;

import { FeeManager } from "../abstract/FeeManager.sol";

contract FeeManagerMock is FeeManager {
    bool private shouldSync;

    /**
     * @param _token FAN token address
     */
    constructor(address _token) FeeManager(_token) {}

    function canSyncFee(address, address) external view override returns (bool shouldSyncFee) {
        return shouldSync;
    }

    function _syncFee() internal override {}

    function setSync(bool sync) external {
        shouldSync = sync;
    }
}
