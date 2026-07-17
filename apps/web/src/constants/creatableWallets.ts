import type { WalletType } from "../types/wallet";

export type CreatableWalletConfig = {
  type: Extract<
    WalletType,
    "BACKEND_SEC" | "MULTISIG" | "SSS" | "POLICY_GUARD" | "KMS" | "MPC"
  >;
  title: string;
  description: string;
  buttonLabel: string;
};

export const CREATABLE_WALLET_TYPES: CreatableWalletConfig[] = [
  {
    type: "BACKEND_SEC",
    title: "백엔드 보안 지갑",
    description: "서버에서 안전하게 관리되는 사용자 전용 지갑입니다.",
    buttonLabel: "백엔드 보안 지갑 생성",
  },
  {
    type: "MULTISIG",
    title: "멀티시그 지갑",
    description: "관리자 승인 절차를 거쳐 출금되는 사용자 전용 지갑입니다.",
    buttonLabel: "멀티시그 지갑 생성",
  },
  {
    type: "SSS",
    title: "SSS 지갑",
    description:
      "브라우저에서 생성하고 3-of-5 샤드로 복원할 수 있는 사용자 전용 지갑입니다.",
    buttonLabel: "SSS 지갑 생성",
  },
  {
    type: "POLICY_GUARD",
    title: "폴리시 가드 지갑",
    description:
      "온체인 PolicyVault + PolicyGuard로 출금 한도를 강제하는 지갑입니다.",
    buttonLabel: "폴리시 가드 지갑 생성",
  },
  {
    type: "KMS",
    title: "KMS 지갑",
    description: "AWS KMS로 키를 보관·서명하는 외부 연동 지갑입니다.",
    buttonLabel: "KMS 지갑 생성",
  },
  {
    type: "MPC",
    title: "MPC 지갑",
    description: "Dfns MPC로 분산 키 서명을 수행하는 외부 연동 지갑입니다.",
    buttonLabel: "MPC 지갑 생성",
  },
];

export const PLACEHOLDER_ONLY_MESSAGES: Partial<
  Record<CreatableWalletConfig["type"], string>
> = {
  POLICY_GUARD: "폴리시 가드 지갑 생성은 추후 구현 예정입니다.",
  KMS: "KMS 지갑은 외부 서비스 연동 데모로, test 계정(test@test.com)에서 시현할 수 있습니다.",
  MPC: "MPC 지갑은 외부 서비스 연동 데모로, test 계정(test@test.com)에서 시현할 수 있습니다.",
};
