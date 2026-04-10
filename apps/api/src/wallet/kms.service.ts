import { Injectable, Logger } from "@nestjs/common";
import {
  KMSClient,
  GetPublicKeyCommand,
  SignCommand,
} from "@aws-sdk/client-kms";
import {
  JsonRpcProvider,
  computeAddress,
  getBytes,
  Signature,
  Transaction,
  TransactionResponse,
  recoverAddress,
  parseUnits,
} from "ethers";
import * as asn1 from "asn1.js";

const SubjectPublicKeyInfo = asn1.define("SubjectPublicKeyInfo", function (this: any) {
  
  const self = this;
  self.seq().obj(
    self.key("algorithm").seq().obj(
      self.key("algorithm").objid(),
      self.key("parameters").objid(),
    ),
    self.key("publicKey").bitstr(),
  );

});

const EcdsaDerSignature = asn1.define("EcdsaDerSignature", function (this: any) {
    const self = this;
    self.seq().obj(
      self.key("r").int(),
      self.key("s").int(),
    );
});

@Injectable()
export class KmsService {
  private readonly logger = new Logger(KmsService.name);
  private readonly kms: KMSClient;
  private readonly provider: JsonRpcProvider;
  private readonly keyId: string;
  private isSending = false;
  private static readonly SECP256K1_N =
  BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");

private static readonly SECP256K1_HALF_N = KmsService.SECP256K1_N / 2n;

private to32ByteHex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

private normalizeLowS(s: bigint): bigint {
  if (s > KmsService.SECP256K1_HALF_N) {
    return KmsService.SECP256K1_N - s;
  }
  return s;
}

private parseDerSignature(derSignature: Uint8Array): { r: bigint; s: bigint } {
  const decoded = EcdsaDerSignature.decode(Buffer.from(derSignature), "der");

  const r = BigInt(decoded.r.toString(10));
  const s = BigInt(decoded.s.toString(10));

  return { r, s };
}

private async findMatchingYParity(
  digestHex: string,
  r: bigint,
  s: bigint,
  expectedAddress: string,
): Promise<0 | 1> {
  const rHex = this.to32ByteHex(r);
  const sHex = this.to32ByteHex(s);

  for (const yParity of [0, 1] as const) {
    const recovered = recoverAddress(digestHex, {
      r: rHex,
      s: sHex,
      yParity,
    });

    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
      return yParity;
    }
  }

  throw new Error("Failed to determine yParity from KMS signature");
}

  constructor() {
    const region = process.env.AWS_REGION;
    const keyId = process.env.AWS_KMS_KEY_ID;
    const rpc = process.env.SEPOLIA_RPC_URL;

    if (!region) throw new Error("AWS_REGION is missing");
    if (!keyId) throw new Error("AWS_KMS_KEY_ID is missing");
    if (!rpc) throw new Error("SEPOLIA_RPC_URL is missing");

    this.kms = new KMSClient({ region });
    this.provider = new JsonRpcProvider(rpc);
    this.keyId = keyId;
  }

  getProvider() {
    return this.provider;
  }

  async getPublicKey(): Promise<Uint8Array> {
    const res = await this.kms.send(
      new GetPublicKeyCommand({
        KeyId: this.keyId,
      }),
    );

    if (!res.PublicKey) {
      throw new Error("KMS public key not found");
    }

    return res.PublicKey;
  }

  async getAddress(): Promise<string> {
    const publicKeyDer = await this.getPublicKey();

    const decoded = SubjectPublicKeyInfo.decode(Buffer.from(publicKeyDer), "der");
    const publicKeyBuffer: Buffer = decoded.publicKey.data;

    if (!publicKeyBuffer || publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04) {
      throw new Error("Invalid uncompressed secp256k1 public key from KMS");
    }

    const address = computeAddress("0x" + publicKeyBuffer.toString("hex"));

    this.logger.log(`KMS address derived: ${address}`);
    return address;
  }

  async getBalance(): Promise<bigint> {
    const address = await this.getAddress();
    return this.provider.getBalance(address);
  }

  async sendNativeTransaction(
    to: string,
    amountWei: bigint,
  ): Promise<TransactionResponse> {
    if (this.isSending) {
      throw new Error(
        "KMS_NONCE_ERROR: KMS signer is busy processing another transaction.",
      );
    }
  
    this.isSending = true;
  
    try {
      const from = await this.getAddress();
  
      const [nonce, network, feeData] = await Promise.all([
        this.provider.getTransactionCount(from, "pending"),
        this.provider.getNetwork(),
        this.provider.getFeeData(),
      ]);
  
      const gasLimit = 21_000n;
  
      const maxPriorityFeePerGas =
        feeData.maxPriorityFeePerGas ?? parseUnits("2", "gwei");
  
      const maxFeePerGas =
        feeData.maxFeePerGas ?? maxPriorityFeePerGas * 2n;
  
      const tx = Transaction.from({
        type: 2,
        chainId: network.chainId,
        nonce,
        to,
        value: amountWei,
        gasLimit,
        maxPriorityFeePerGas,
        maxFeePerGas,
      });
  
      const digestHex = tx.unsignedHash;
      const digestBytes = getBytes(digestHex);
  
      const signRes = await this.kms.send(
        new SignCommand({
          KeyId: this.keyId,
          Message: digestBytes,
          MessageType: "DIGEST",
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      );
  
      if (!signRes.Signature) {
        throw new Error("KMS_SIGN_EMPTY: KMS Sign returned empty signature");
      }
  
      const parsed = this.parseDerSignature(signRes.Signature);
      const normalizedS = this.normalizeLowS(parsed.s);
  
      const yParity = await this.findMatchingYParity(
        digestHex,
        parsed.r,
        normalizedS,
        from,
      );
  
      tx.signature = Signature.from({
        r: this.to32ByteHex(parsed.r),
        s: this.to32ByteHex(normalizedS),
        yParity,
      });
  
      const rawTx = tx.serialized;
      const response = await this.provider.broadcastTransaction(rawTx);
  
      this.logger.log(
        `KMS broadcasted tx: hash=${response.hash}, nonce=${nonce}, from=${from}, to=${to}, value=${amountWei.toString()}`,
      );
  
      return response;
    } catch (error: any) {
      this.logger.error(`KMS sendNativeTransaction failed: ${error?.message || error}`);
  
      const message = error?.message || "";
  
      if (message.includes("AccessDeniedException")) {
        throw new Error(
          "KMS_ACCESS_DENIED: AWS KMS access denied. Check IAM permissions and KMS key policy.",
        );
      }
  
      if (message.includes("KMSInvalidStateException")) {
        throw new Error(
          "KMS_INVALID_STATE: AWS KMS key is not in a valid state.",
        );
      }
  
      if (message.includes("invalid sender")) {
        throw new Error(
          "KMS_INVALID_SENDER: Invalid sender. KMS signature recovery may have failed.",
        );
      }
  
      if (message.includes("insufficient funds")) {
        throw new Error(
          "KMS_INSUFFICIENT_FUNDS: KMS wallet has insufficient ETH for amount + gas.",
        );
      }
  
      if (message.includes("nonce")) {
        throw new Error(
          "KMS_NONCE_ERROR: Nonce issue detected while sending KMS transaction.",
        );
      }
  
      throw new Error(`KMS_TX_FAILED: ${message}`);
    } finally {
      this.isSending = false;
    }
  }
 

}