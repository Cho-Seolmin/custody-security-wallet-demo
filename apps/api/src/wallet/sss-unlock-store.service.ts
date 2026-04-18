import { Injectable } from "@nestjs/common";

type SssSession = {
  privateKey: string;
  expiresAt: number;
};

@Injectable()
export class SssUnlockStoreService {
  private store = new Map<string, SssSession>();

  set(walletId: string, privateKey: string, ttlSeconds = 300) {
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.store.set(walletId, {
      privateKey,
      expiresAt,
    });
  }

  get(walletId: string): string | null {
    const session = this.store.get(walletId);

    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.store.delete(walletId);
      return null;
    }

    return session.privateKey;
  }

  clear(walletId: string) {
    this.store.delete(walletId);
  }
}