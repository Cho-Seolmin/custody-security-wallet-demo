// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./IPolicyGuard.sol";

contract PolicyGuardV1 is IPolicyGuard {
    uint256 public constant MAX_SINGLE_TRANSFER = 0.001 ether;

    function check(address to, uint256 amount) external pure returns (bool) {
        if (to == address(0)) return false;
        if (amount == 0) return false;
        if (amount > MAX_SINGLE_TRANSFER) return false;

        return true;
    }
}