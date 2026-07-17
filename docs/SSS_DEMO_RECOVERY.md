# SSS Demo Recovery (Sepolia Testnet)

이 문서는 **Custody Security Wallet Demo** 포트폴리오용 SSS 지갑 복구 가이드입니다.

> **Sepolia 테스트 전용입니다.** 실제 자산이나 메인net에는 사용하지 마세요.  
> 운영 환경에서는 샤드를 custodian에게 분산 보관하고, Git/웹에 공개하지 않습니다.  
> 아래 3/5 샤드는 **의도적으로 공개된 고정 Sepolia 데모 지갑**용입니다.  
> 회원가입·지갑 생성 시마다 새로 발급되는 값이 **아닙니다.** (이 프로젝트에 지갑 생성 API/UI는 없음)

## Demo Wallet

| 항목 | 값 |
| --- | --- |
| Network | Ethereum Sepolia |
| Threshold | 3-of-5 (아래 3개 샤드로 복구 가능) |
| Wallet address | `0xA47a4420006348B23327a85c079AD3f37A037b07` |
| Scope | 사전 provisioning된 데모 DB의 SSS `Wallet.address`와 일치해야 함 |

## Public Demo Shards (3/5)

```
0801a6812719d2f058a35d6055ced3294cde6ca6defd2051aff0ec892dc81f216ef640e28ca006417bfaa5548cf918c706008d55fa5ec9e5864357f6d33e61eadf8d762d7cbc2b9aabdb690a8e5cf88ec6ee
0802aa35e2502083e024e30512f9a475de22cb8c8c1023bad385011fc18b534ee0705253d0fe69820193aea26ac6d7272aebef4d0434d6ada84c46c17214c6032ffd51eaeb4f072577245b44d3ca9d263d66
08030cb4c549f273b887be654737775c92fda79852ef03047c72ed5cec204cca8e4412395cf16f477a180b96e6a1cf2b2c5e62bffece1f362e18113ba1f7a761f0da2737971f2c05dcfb32e85d6f65f7fb96
```

## 복구 방법 (오프라인)

1. 저장소 클론 후 오프라인 도구 디렉터리로 이동:

```bash
cd apps/api/tools/offline-sss-recovery
npm install
```

2. `recover-sss.js`에 위 3개 샤드와 지갑 주소가 이미 채워져 있습니다. (로컬에서 수정했다면 주소 일치 여부를 확인하세요.)

3. 복구 실행:

```bash
npm run recover
```

4. 출력된 **private key**를 웹 UI의 SSS 지갑 **Private Key** 입력란에 붙여넣습니다. (서버로 전송되지 않음)  
   복구된 private key는 **이 문서에 적지 마세요.**

5. 출금 금액·주소 입력 후 **출금 요청** → 브라우저에서 `signedTx` 생성 → 서버는 signedTx만 검증·broadcast합니다.  
   서버 unlock / “1회 후 자동 잠금” DB 상태는 없습니다. 요청 성공 후 UI는 입력란을 비웁니다.

6. 터미널/클립보드에 남은 private key 기록도 정리하세요.

## 보안 모델 (데모 vs 운영)

| | 데모 (이 프로젝트) | 운영 |
| --- | --- | --- |
| 샤드 보관 | 고정 데모 지갑 3/5를 문서에 공개 | custodian 분산, HSM/Vault |
| private key | 브라우저에서만 서명에 사용 | HSM/MPC/TEE 등 |
| 서버 | signedTx만 수신·검증·broadcast | 정책·감사·승인 파이프라인 |

## 관련 코드

- 오프라인 복구: [`apps/api/tools/offline-sss-recovery/`](../apps/api/tools/offline-sss-recovery/)
- 프론트 서명: [`apps/web/src/components/WalletCard.tsx`](../apps/web/src/components/WalletCard.tsx)
- 백엔드 검증·broadcast: [`apps/api/src/wallet/wallet.service.ts`](../apps/api/src/wallet/wallet.service.ts), [`apps/api/src/wallet/executors/sss.executor.ts`](../apps/api/src/wallet/executors/sss.executor.ts)
