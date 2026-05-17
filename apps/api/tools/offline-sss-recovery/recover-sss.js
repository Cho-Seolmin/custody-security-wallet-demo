const sss = require("shamirs-secret-sharing");
const { Wallet } = require("ethers");

/**
 * 사용 방법:
 * 1. 아래 shares 배열에 5개 중 최소 3개의 샤드를 넣는다.
 * 2. expectedAddress에 SSS 지갑 주소를 넣는다.
 * 3. npm run recover 실행
 */

const shares = [
  "여기에_샤드_1",
  "여기에_샤드_2",
  "여기에_샤드_3",
];

const expectedAddress = "여기에_SSS_지갑주소";

try {
  const buffers = shares.map((share) => Buffer.from(share.trim(), "hex"));

  const recovered = sss.combine(buffers);
  const privateKey = "0x" + recovered.toString("hex");

  const wallet = new Wallet(privateKey);

  console.log("Derived Address:");
  console.log(wallet.address);

  if (wallet.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Recovered address does not match expected SSS wallet address.");
  }

  console.log("");
  console.log("Recovery success.");
  console.log("");
  console.log("Recovered Private Key:");
  console.log(privateKey);
  console.log("");
  console.log("Warning: Use this private key only for one-time SSS unlock, then clear it.");
} catch (error) {
  console.error("Recovery failed.");
  console.error(error.message);
  process.exit(1);
}