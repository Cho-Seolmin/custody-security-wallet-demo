import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import {
  generateSssWalletAndShards,
  parseSssShardText,
  reconstructPrivateKeyFromShards,
  SSS_THRESHOLD,
  type SssShardDocument,
} from "./sssShards";

describe("sssShards", () => {
  it("creates 5 shards and reconstructs the same address from multiple 3-of-5 sets", () => {
    const generated = generateSssWalletAndShards();
    expect(generated.shards).toHaveLength(5);

    const combos = [
      [0, 1, 2],
      [0, 2, 4],
      [1, 3, 4],
    ];

    for (const indexes of combos) {
      const subset = indexes.map((i) => generated.shards[i]);
      const recovered = reconstructPrivateKeyFromShards(
        subset,
        generated.address,
      );
      expect(recovered.address).toBe(generated.address);
      expect(recovered.privateKey.toLowerCase()).toBe(
        generated.privateKey.toLowerCase(),
      );
    }
  });

  it("rejects fewer than 3 shards", () => {
    const generated = generateSssWalletAndShards();
    expect(() =>
      reconstructPrivateKeyFromShards(generated.shards.slice(0, 2)),
    ).toThrow(/최소 3/);
  });

  it("rejects duplicate share indexes", () => {
    const generated = generateSssWalletAndShards();
    const dup = [
      generated.shards[0],
      generated.shards[1],
      { ...generated.shards[0], shareIndex: generated.shards[0].shareIndex },
    ];
    expect(() => reconstructPrivateKeyFromShards(dup)).toThrow(/중복/);
  });

  it("rejects mixed wallet shards", () => {
    const a = generateSssWalletAndShards();
    const b = generateSssWalletAndShards();
    const mixed = [a.shards[0], a.shards[1], b.shards[2]];
    expect(() => reconstructPrivateKeyFromShards(mixed)).toThrow(/섞여/);
  });

  it("rejects tampered share data via address mismatch or combine failure", () => {
    const generated = generateSssWalletAndShards();
    const tampered: SssShardDocument = {
      ...generated.shards[0],
      share: generated.shards[0].share.replace(/[0-9a-f]/, (c) =>
        c === "0" ? "1" : "0",
      ),
    };
    const subset = [tampered, generated.shards[1], generated.shards[2]];
    expect(() =>
      reconstructPrivateKeyFromShards(subset, generated.address),
    ).toThrow();
  });

  it("parses shard JSON and validates version/scheme", () => {
    const generated = generateSssWalletAndShards();
    const text = JSON.stringify(generated.shards[0]);
    const parsed = parseSssShardText(text);
    expect(parsed.shareIndex).toBe(1);
    expect(parsed.walletAddress).toBe(generated.address);

    expect(() =>
      parseSssShardText(JSON.stringify({ ...generated.shards[0], version: 99 })),
    ).toThrow(/버전/);
  });

  it("rejects reconstruction that does not match expected wallet address", () => {
    const generated = generateSssWalletAndShards();
    const other = Wallet.createRandom().address;
    expect(() =>
      reconstructPrivateKeyFromShards(generated.shards.slice(0, 3), other),
    ).toThrow(/등록된 SSS/);
  });

  it("export format never embeds the private key string", () => {
    const generated = generateSssWalletAndShards();
    const pkHex = generated.privateKey.slice(2).toLowerCase();
    for (const shard of generated.shards) {
      const json = JSON.stringify(shard);
      expect(json.toLowerCase()).not.toContain(pkHex);
      expect(json).not.toContain("privateKey");
    }
  });
});

// silence unused threshold import if tree-shaken oddly
void SSS_THRESHOLD;
