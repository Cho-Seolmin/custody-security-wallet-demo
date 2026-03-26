import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  const PolicyGuard = await ethers.getContractFactory("PolicyGuard");
  const contract = await PolicyGuard.deploy(deployer.address);

  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("PolicyGuard deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});