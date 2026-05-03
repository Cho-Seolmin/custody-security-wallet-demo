// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./IPolicyGuard.sol";

contract PolicyVault {
    address public owner;
    address public operator;
    IPolicyGuard public policyGuard;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event PolicyGuardChanged(address indexed previousGuard, address indexed newGuard);
    event OperatorChanged(address indexed previousOperator, address indexed newOperator);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner || msg.sender == operator, "Not owner or operator");
        _;
    }

    constructor(address initialOwner, address initialOperator, address initialGuard) {
        require(initialOwner != address(0), "Invalid owner");
        require(initialOperator != address(0), "Invalid operator");
        require(initialGuard != address(0), "Invalid guard");

        owner = initialOwner;
        operator = initialOperator;
        policyGuard = IPolicyGuard(initialGuard);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address to, uint256 amount) external onlyOwnerOrOperator {
        require(policyGuard.check(to, amount), "Policy rejected");
        require(address(this).balance >= amount, "Insufficient balance");

        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(to, amount);
    }

    function setPolicyGuard(address newGuard) external onlyOwner {
        require(newGuard != address(0), "Invalid guard");

        address previousGuard = address(policyGuard);
        policyGuard = IPolicyGuard(newGuard);

        emit PolicyGuardChanged(previousGuard, newGuard);
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "Invalid operator");

        address previousOperator = operator;
        operator = newOperator;

        emit OperatorChanged(previousOperator, newOperator);
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");

        address previousOwner = owner;
        owner = newOwner;

        emit OwnerChanged(previousOwner, newOwner);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}