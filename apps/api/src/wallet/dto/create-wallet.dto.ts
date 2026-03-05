export class CreateWalletDto {
    walletType!:
      | "MULTISIG"
      | "SSS"
      | "KMS"
      | "BACKEND_SEC"
      | "MPC"
      | "POLICY_GUARD";
  }