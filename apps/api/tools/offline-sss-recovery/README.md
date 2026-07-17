# Offline SSS Recovery Tool

Custody Security Wallet Demo의 SSS 지갑 복구용 오프라인 도구입니다.

## Sepolia 데모 (의도적으로 공개된 데모 지갑)

이 도구에 채워진 샤드·주소는 **지갑 생성 API가 발급하는 값이 아닙니다.**  
포트폴리오 시연용으로 문서에 공개된 **고정 Sepolia 데모 지갑**의 3/5 샤드입니다.

자세한 내용과 샤드 목록:

**[docs/SSS_DEMO_RECOVERY.md](../../../docs/SSS_DEMO_RECOVERY.md)** (저장소 루트)

```bash
npm install
npm run recover
```

출력된 private key를 웹 UI SSS 지갑 **Private Key** 입력란에 붙여넣으세요.  
키는 브라우저 서명에만 사용되며 **서버로 전송되지 않습니다.** 요청 성공 후 UI 입력란은 비워집니다.

> 복구된 private key는 문서에 적지 마세요. 터미널 출력은 로컬에서만 사용하고 정리하세요.

## 목적

공개 데모 샤드(또는 운영에서 custodian이 보관한 샤드) 중 임계치(3-of-5)를 모아 private key를 복구합니다.

## 보안 원칙 (데모)

- 샤드는 **의도적으로** 문서에 공개 (Sepolia 테스트 전용)
- private key 복구는 로컬 PC에서 수행
- private key는 서버·DB에 저장하지 않음
- 사용 후 입력값·클립보드·터미널 기록 정리

운영 환경에서는 샤드 분산 보관 + HSM/MPC 등이 필요합니다.
