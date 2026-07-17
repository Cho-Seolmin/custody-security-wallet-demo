const sss = require("shamirs-secret-sharing");
const { Wallet } = require("ethers");

/**
 * Sepolia SSS demo wallet recovery (3-of-5).
 * Demo shards are intentionally public — see docs/SSS_DEMO_RECOVERY.md
 */

const shares = [
  "0801a6812719d2f058a35d6055ced3294cde6ca6defd2051aff0ec892dc81f216ef640e28ca006417bfaa5548cf918c706008d55fa5ec9e5864357f6d33e61eadf8d762d7cbc2b9aabdb690a8e5cf88ec6ee",
  "0802aa35e2502083e024e30512f9a475de22cb8c8c1023bad385011fc18b534ee0705253d0fe69820193aea26ac6d7272aebef4d0434d6ada84c46c17214c6032ffd51eaeb4f072577245b44d3ca9d263d66",
  "08030cb4c549f273b887be654737775c92fda79852ef03047c72ed5cec204cca8e4412395cf16f477a180b96e6a1cf2b2c5e62bffece1f362e18113ba1f7a761f0da2737971f2c05dcfb32e85d6f65f7fb96",
];

const expectedAddress = "0xA47a4420006348B23327a85c079AD3f37A037b07";

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
  console.log(
    "Warning: Use this key only in the browser Private Key field for Sepolia demo signing, then clear the input. It is never sent to the server.",
  );
} catch (error) {
  console.error("Recovery failed.");
  console.error(error.message);
  process.exit(1);
}
