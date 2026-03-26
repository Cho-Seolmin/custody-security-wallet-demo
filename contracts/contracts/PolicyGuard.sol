// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract PolicyGuard {
    address public owner;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Invalid owner");
        owner = initialOwner;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid to");
        require(address(this).balance >= amount, "Insufficient balance");

        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(to, amount);
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