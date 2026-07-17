declare module "shamirs-secret-sharing" {
  interface SplitOptions {
    shares: number;
    threshold: number;
  }

  interface ShamirsSecretSharing {
    split(secret: Buffer, options: SplitOptions): Buffer[];
    combine(shares: Buffer[]): Buffer;
  }

  const sss: ShamirsSecretSharing;
  export default sss;
}
