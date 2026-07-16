# Offline SSS Recovery Tool

Custody Security Wallet Demo의 SSS 지갑 복구용 오프라인 도구입니다.

## Sepolia 데모 (샤드 공개)

포트폴리오 시연을 위해 **3/5 샤드가 문서에 공개**되어 있습니다. 자세한 내용과 샤드 목록:

**[docs/SSS_DEMO_RECOVERY.md](../../../docs/SSS_DEMO_RECOVERY.md)** (저장소 루트)

이 디렉터리의 `recover-sss.js`에는 데모 샤드·주소가 미리 채워져 있어, 아래만 실행하면 됩니다.

```bash
npm install
npm run recover
```

출력된 private key를 웹 UI SSS 지갑 **Private Key** 입력란에 1회 사용하세요.

## 목적

SSS 지갑 생성 시 발급된 5개 샤드 중 최소 3개를 사용해 private key를 복구합니다.

복구된 private key는 브라우저에서 signedTx 생성에만 사용하며, **서버로 전송되지 않습니다.**

## 보안 원칙 (데모)

- 샤드는 **의도적으로** 문서에 공개 (Sepolia 테스트 전용)
- private key 복구는 로컬 PC에서 수행
- private key는 서버·DB에 저장하지 않음
- 사용 후 입력값·클립보드·터미널 기록 정리

운영 환경에서는 샤드 분산 보관 + HSM/MPC 등이 필요합니다.
