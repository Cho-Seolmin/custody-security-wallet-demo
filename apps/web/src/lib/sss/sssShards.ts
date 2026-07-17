import { Buffer } from "buffer";
import sss from "shamirs-secret-sharing";
import { getAddress, Wallet } from "ethers";

export const SSS_SCHEME = "shamir-secret-sharing" as const;
export const SSS_VERSION = 1 as const;
export const SSS_THRESHOLD = 3 as const;
export const SSS_TOTAL = 5 as const;
export const SSS_NETWORK = "sepolia" as const;

export type SssShardDocument = {
  version: typeof SSS_VERSION;
  scheme: typeof SSS_SCHEME;
  threshold: typeof SSS_THRESHOLD;
  total: typeof SSS_TOTAL;
  shareIndex: number;
  walletAddress: string;
  network: typeof SSS_NETWORK;
  createdAt: string;
  /** Hex-encoded shamirs-secret-sharing share buffer. Never log this field. */
  share: string;
};

export type GeneratedSssWallet = {
  address: string;
  shards: SssShardDocument[];
  /** Transient only — clear after backup confirmation / registration. */
  privateKey: string;
};

function normalizePrivateKeyHex(privateKey: string): string {
  const trimmed = privateKey.trim().toLowerCase();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("프라이빗 키는 정확히 32바이트(64 hex)여야 합니다.");
  }
  return hex;
}

function privateKeyToSecretBytes(privateKey: string): Buffer {
  return Buffer.from(normalizePrivateKeyHex(privateKey), "hex");
}

function secretBytesToPrivateKey(secret: Buffer): string {
  if (secret.length !== 32) {
    throw new Error("복원된 시크릿 길이가 32바이트가 아닙니다.");
  }
  return `0x${secret.toString("hex")}`;
}

/**
 * Create a new EOA and split its private key into 5 shards (threshold 3).
 * Private key and shards stay in memory only — never send to the server.
 */
export function generateSssWalletAndShards(): GeneratedSssWallet {
  const eoa = Wallet.createRandom();
  const address = getAddress(eoa.address);
  const secret = privateKeyToSecretBytes(eoa.privateKey);
  const shareBuffers = sss.split(secret, {
    shares: SSS_TOTAL,
    threshold: SSS_THRESHOLD,
  });

  if (shareBuffers.length !== SSS_TOTAL) {
    throw new Error("샤드 생성에 실패했습니다.");
  }

  const createdAt = new Date().toISOString();
  const shards: SssShardDocument[] = shareBuffers.map((buf, index) => ({
    version: SSS_VERSION,
    scheme: SSS_SCHEME,
    threshold: SSS_THRESHOLD,
    total: SSS_TOTAL,
    shareIndex: index + 1,
    walletAddress: address,
    network: SSS_NETWORK,
    createdAt,
    share: buf.toString("hex"),
  }));

  return {
    address,
    shards,
    privateKey: eoa.privateKey,
  };
}

function parseShardJson(raw: unknown): SssShardDocument {
  if (!raw || typeof raw !== "object") {
    throw new Error("샤드 JSON 형식이 올바르지 않습니다.");
  }

  const doc = raw as Record<string, unknown>;

  if (doc.version !== SSS_VERSION) {
    throw new Error("지원하지 않는 샤드 버전입니다.");
  }
  if (doc.scheme !== SSS_SCHEME) {
    throw new Error("지원하지 않는 샤드 스킴입니다.");
  }
  if (doc.threshold !== SSS_THRESHOLD || doc.total !== SSS_TOTAL) {
    throw new Error("샤드 threshold/total 값이 올바르지 않습니다.");
  }
  if (doc.network !== SSS_NETWORK) {
    throw new Error("Sepolia 네트워크 샤드만 사용할 수 있습니다.");
  }
  if (
    typeof doc.shareIndex !== "number" ||
    !Number.isInteger(doc.shareIndex) ||
    doc.shareIndex < 1 ||
    doc.shareIndex > SSS_TOTAL
  ) {
    throw new Error("샤드 인덱스가 올바르지 않습니다.");
  }
  if (typeof doc.walletAddress !== "string" || !doc.walletAddress) {
    throw new Error("샤드에 지갑 주소가 없습니다.");
  }
  if (typeof doc.share !== "string" || !/^[0-9a-fA-F]+$/.test(doc.share)) {
    throw new Error("샤드 데이터가 올바르지 않습니다.");
  }
  if (typeof doc.createdAt !== "string") {
    throw new Error("샤드 생성 시각이 올바르지 않습니다.");
  }

  let walletAddress: string;
  try {
    walletAddress = getAddress(doc.walletAddress);
  } catch {
    throw new Error("샤드의 지갑 주소가 유효하지 않습니다.");
  }

  return {
    version: SSS_VERSION,
    scheme: SSS_SCHEME,
    threshold: SSS_THRESHOLD,
    total: SSS_TOTAL,
    shareIndex: doc.shareIndex,
    walletAddress,
    network: SSS_NETWORK,
    createdAt: doc.createdAt,
    share: doc.share.toLowerCase(),
  };
}

export function parseSssShardText(text: string): SssShardDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("샤드 JSON을 파싱할 수 없습니다.");
  }
  return parseShardJson(parsed);
}

/**
 * Wrap a legacy offline-tool hex share (docs/SSS_DEMO_RECOVERY.md) into the
 * versioned document format. Caller must supply the registered wallet address.
 */
export function shardFromLegacyHex(
  hexShare: string,
  shareIndex: number,
  walletAddress: string,
): SssShardDocument {
  const share = hexShare.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(share) || share.length < 64) {
    throw new Error("레거시 hex 샤드 형식이 올바르지 않습니다.");
  }
  if (
    !Number.isInteger(shareIndex) ||
    shareIndex < 1 ||
    shareIndex > SSS_TOTAL
  ) {
    throw new Error("샤드 인덱스가 올바르지 않습니다.");
  }

  return {
    version: SSS_VERSION,
    scheme: SSS_SCHEME,
    threshold: SSS_THRESHOLD,
    total: SSS_TOTAL,
    shareIndex,
    walletAddress: getAddress(walletAddress),
    network: SSS_NETWORK,
    createdAt: new Date().toISOString(),
    share,
  };
}

export type ReconstructResult = {
  privateKey: string;
  address: string;
};

/**
 * Reconstruct a private key from at least 3 validated shard documents.
 * Does not persist anything.
 */
export function reconstructPrivateKeyFromShards(
  shards: SssShardDocument[],
  expectedWalletAddress?: string,
): ReconstructResult {
  if (shards.length < SSS_THRESHOLD) {
    throw new Error(`복원에는 최소 ${SSS_THRESHOLD}개의 샤드가 필요합니다.`);
  }

  const uniqueByIndex = new Map<number, SssShardDocument>();
  for (const shard of shards) {
    if (uniqueByIndex.has(shard.shareIndex)) {
      throw new Error("동일한 샤드 인덱스가 중복되었습니다.");
    }
    uniqueByIndex.set(shard.shareIndex, shard);
  }

  if (uniqueByIndex.size < SSS_THRESHOLD) {
    throw new Error(`서로 다른 샤드가 최소 ${SSS_THRESHOLD}개 필요합니다.`);
  }

  const selected = [...uniqueByIndex.values()];
  const addressSet = new Set(selected.map((s) => s.walletAddress.toLowerCase()));
  if (addressSet.size !== 1) {
    throw new Error("서로 다른 지갑의 샤드가 섞여 있습니다.");
  }
  const networkSet = new Set(selected.map((s) => s.network));
  if (networkSet.size !== 1 || !networkSet.has(SSS_NETWORK)) {
    throw new Error("Sepolia 네트워크 샤드만 사용할 수 있습니다.");
  }

  const metaAddress = selected[0].walletAddress;

  if (expectedWalletAddress) {
    const expected = getAddress(expectedWalletAddress);
    if (metaAddress.toLowerCase() !== expected.toLowerCase()) {
      throw new Error("샤드 주소가 등록된 SSS 지갑과 일치하지 않습니다.");
    }
  }

  let recovered: Buffer;
  try {
    const buffers = selected.map((s) => Buffer.from(s.share, "hex"));
    recovered = sss.combine(buffers);
  } catch {
    throw new Error("샤드 결합에 실패했습니다. 손상되었거나 잘못된 샤드일 수 있습니다.");
  }

  const privateKey = secretBytesToPrivateKey(recovered);
  let wallet: Wallet;
  try {
    wallet = new Wallet(privateKey);
  } catch {
    throw new Error("복원된 프라이빗 키가 유효하지 않습니다.");
  }

  const derived = getAddress(wallet.address);
  if (derived.toLowerCase() !== metaAddress.toLowerCase()) {
    throw new Error("복원된 주소가 샤드 메타데이터와 일치하지 않습니다.");
  }

  if (expectedWalletAddress) {
    const expected = getAddress(expectedWalletAddress);
    if (derived.toLowerCase() !== expected.toLowerCase()) {
      throw new Error("복원된 주소가 등록된 SSS 지갑과 일치하지 않습니다.");
    }
  }

  return { privateKey, address: derived };
}

export function shardFilename(shard: SssShardDocument): string {
  const short = shard.walletAddress.slice(2, 8).toLowerCase();
  return `sss-shard-${shard.shareIndex}-of-${shard.total}-${short}.json`;
}

export function downloadShardFile(shard: SssShardDocument): void {
  const payload = JSON.stringify(shard, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = shardFilename(shard);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
