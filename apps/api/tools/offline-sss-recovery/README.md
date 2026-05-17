# Offline SSS Recovery Tool

Custody Security Wallet Demo의 SSS 지갑 복구용 오프라인 도구입니다.

## 목적

SSS 지갑 생성 시 발급된 5개 샤드 중 최소 3개를 사용해 private key를 복구합니다.

복구된 private key는 온라인 프론트엔드의 SSS Unlock 입력창에 1회성으로 사용합니다.

## 보안 원칙

- 샤드는 서버로 전송하지 않습니다.
- private key 복구는 오프라인 PC에서 수행합니다.
- 복구된 private key는 저장하지 않습니다.
- 사용 후 화면 기록, 클립보드, 임시 파일을 정리합니다.

## 준비

온라인 환경에서 최초 1회 설치:

```bash
npm install