// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPolicyGuard {
    function check(address to, uint256 amount) external view returns (bool);
}