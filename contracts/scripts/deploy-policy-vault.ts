import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=====================================");
  console.log("🚀 Deploying Policy System");
  console.log("Deploy account:", deployer.address);
  console.log("=====================================");

  // -----------------------------
  // 1. PolicyGuardV1 배포
  // -----------------------------
  const PolicyGuard = await ethers.getContractFactory("PolicyGuardV1");
  const policyGuard = await PolicyGuard.deploy();

  await policyGuard.waitForDeployment();
  const policyGuardAddress = await policyGuard.getAddress();

  console.log("✅ PolicyGuardV1 deployed:", policyGuardAddress);

  // -----------------------------
  // 2. PolicyVault 배포
  // -----------------------------
  // ⚠️ backend signer 주소 필요
  const backendSigner = process.env.BACKEND_SIGNER_ADDRESS;

  if (!backendSigner) {
    throw new Error("❌ BACKEND_SIGNER_ADDRESS missing in .env");
  }

  const PolicyVault = await ethers.getContractFactory("PolicyVault");

  const policyVault = await PolicyVault.deploy(
    deployer.address,     // owner
    backendSigner,        // operator (백엔드 signer)
    policyGuardAddress    // policy guard
  );

  await policyVault.waitForDeployment();
  const policyVaultAddress = await policyVault.getAddress();

  console.log("✅ PolicyVault deployed:", policyVaultAddress);

  // -----------------------------
  // 결과 출력
  // -----------------------------
  console.log("\n=====================================");
  console.log("🎯 DEPLOY RESULT");
  console.log("=====================================");

  console.log(`POLICY_GUARD_ADDRESS=${policyGuardAddress}`);
  console.log(`POLICY_VAULT_ADDRESS=${policyVaultAddress}`);

  console.log("\n👉 .env에 복사:");
  console.log(`POLICY_GUARD_ADDRESS=${policyGuardAddress}`);
  console.log(`POLICY_VAULT_ADDRESS=${policyVaultAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});