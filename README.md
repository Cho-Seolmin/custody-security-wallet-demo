# Custody Security Wallet Demo

보안 중심 커스터디(Custody) 지갑 **포트폴리오 데모**입니다. 6가지 키 관리/보안 모델(Backend Signer, Multisig, Policy Guard, AWS KMS, MPC(DFNS), SSS)을 **하나의 출금 파이프라인** 위에서 비교·시연할 수 있도록 구현했습니다.

> **셀프서비스 지갑 생성 프로젝트가 아닙니다.** 계정마다 사전 구성(pre-provisioned)된 6종 데모 지갑을 비교·테스트하는 것이 목적이며, 지갑 생성 UI/API는 제공하지 않습니다.

아키텍처·보안 모델별 출금 흐름·Queue/Worker 파이프라인 등 **로직 상세**는 [`apps/api/README.md`](apps/api/README.md)를 참고하세요.

---

## 이 데모가 보여 주는 것

| 영역 | 내용 |
| --- | --- |
| 출금 처리 | Queue + Worker 비동기, Retry, Audit Log |
| 승인 | MULTISIG 앱 레벨 2-of-2 관리자 승인 + 10분 만료 |
| 인증 | httpOnly cookie JWT, 이메일 인증, 0.01 ETH+ OTP |
| 키 관리 | Backend Signer / KMS / MPC / SSS / Policy Guard / Multisig |
| 실시간 | WebSocket `withdraw.updated` → API 재조회 |
| SSS | 브라우저 client-side signing, 서버는 signedTx만 검증·broadcast |

**Sepolia 테스트넷 전용**입니다. 실제 자산·메인net 용도가 아닙니다.

---

## Tech Stack

| 영역 | 스택 |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, React Router |
| Backend | NestJS 11, Prisma 6, PostgreSQL |
| Auth | JWT (httpOnly cookie), bcrypt, TOTP (speakeasy) |
| Blockchain | ethers v6, Sepolia Testnet |
| 외부 연동 | AWS KMS, DFNS (MPC) |
| Realtime | Socket.IO |
| Validation | class-validator / class-transformer |
| Test | Jest (unit + e2e) |

---

## Monorepo 구조

```text
.
├── apps/
│   ├── api/     # NestJS + Prisma + Postgres 백엔드
│   └── web/     # React + Vite 프론트엔드
├── packages/
│   └── shared/  # 공용 타입/유틸 (workspace)
├── contracts/   # PolicyGuard 온체인 컨트랙트 (Solidity)
├── docs/        # SSS 데모 복구 가이드 등
└── scripts/     # 유지보수 스크립트 (예: delete-sss.ts)
```

---

## Quick Start (로컬)

### 1. 사전 준비

- Node.js 20+
- PostgreSQL
- **Sepolia RPC** + **Backend Signer private key** (가스·서명용)
- **AWS KMS** 자격 증명 + Key ID (KMS 지갑)
- **DFNS** 계정 + credential PEM 파일 경로 (MPC 지갑)

> API는 부팅 시 `SignerService`, `KmsService`, `MpcService`를 **항상 초기화**합니다. README 하단 [필수 환경 변수](#필수-환경-변수)를 모두 채워야 서버가 기동됩니다.  
> Settings 화면의 “연결 안 됨” 표시는 **런타임 헬스체크** 기준이며, env 미설정과는 별개입니다.

### 2. 설치

```bash
git clone <repo-url>
cd custody-security-wallet-demo
npm install
```

### 3. 환경 변수

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

[`apps/api/.env.example`](apps/api/.env.example)의 **필수 항목**을 채웁니다. 변수 설명은 [`apps/api/README.md#environment-variables`](apps/api/README.md#environment-variables) 참고.

### 4. DB 마이그레이션

```bash
npm --workspace apps/api exec prisma migrate dev
```

### 5. 데모 데이터 (6종 지갑)

지갑 생성 API/UI는 **없습니다.** 아래 중 하나가 필요합니다.

- **포트폴리오 시연용**: 이미 6종 지갑·한도·주소가 들어 있는 PostgreSQL을 사용 (로그인 화면의 테스트 계정과 매칭)
- **신규 clone**: `User` + `Wallet`(6 types) + `WalletLimit` 등을 **DB에 직접 provisioning** (seed 스크립트는 미포함)

회원가입으로 만든 계정은 **지갑이 자동 생성되지 않습니다.** 데모 비교는 provisioning된 계정으로 진행하세요.

### 6. 개발 서버

```bash
npm run dev:api   # http://localhost:3000
npm run dev:web   # http://localhost:5173
```

로그인 화면에 안내된 **테스트 계정**(`test@test.com` / `1234` 등)은 **위 provisioning DB에 존재할 때만** 동작합니다.

### 7. 테스트

```bash
npm --workspace apps/api run test       # 단위 테스트 (29 tests, DB 불필요)
npm --workspace apps/api run test:e2e   # e2e (Postgres + .env 필요, CI 제외)
```

---

## 필수 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` | JWT + 계정별 OTP secret 파생 |
| `APP_BASE_URL` | 이메일 인증 링크 (데모: register 응답의 verify URL) |
| `FRONTEND_URL` | CORS + WebSocket origin (로컬: `http://localhost:5173`) |
| `SEPOLIA_RPC_URL` | Sepolia JSON-RPC |
| `BACKEND_SIGNER_PRIVATE_KEY` | BACKEND_SEC / MULTISIG / POLICY_GUARD / SSS broadcast 등 |
| `AWS_REGION`, `AWS_KMS_KEY_ID` (+ IAM 자격) | KMS 지갑 |
| `DFNS_*`, `DFNS_PRIVATE_KEY_PATH` | MPC(DFNS) 지갑 |

프론트: `VITE_API_URL` (기본 `http://localhost:3000`)

---

## 인증·회원가입 (로직 요약)

```text
POST /auth/register → User(status=PENDING) + verify-email JWT
GET  /auth/verify-email?token=... → status=ACTIVE
POST /auth/login → httpOnly accessToken cookie (type=access)
GET  /auth/me → 세션 확인 (프론트 ProtectedRoute)
```

- verify-email JWT는 **API 인증에 사용 불가** (`JwtStrategy`에서 차단)
- PENDING 사용자는 **10분 후 cron**으로 삭제 (미인증 가입 정리)
- 회원가입 비밀번호: **8자 이상** / 로그인 화면 테스트 계정은 **데모용 짧은 비밀번호**일 수 있음

---

## SSS Demo (Sepolia)

포트폴리오 시연을 위해 **3/5 샤드를 문서에 공개**합니다.

- **[SSS Demo Recovery Guide](docs/SSS_DEMO_RECOVERY.md)**
- 오프라인 도구: [`apps/api/tools/offline-sss-recovery/`](apps/api/tools/offline-sss-recovery/)

흐름: 오프라인 `npm run recover` → private key → 웹 UI **브라우저에서 signedTx 생성** → 서버 검증·Queue → Worker broadcast. **private key는 서버로 전송되지 않습니다.**

---

## 배포 (포트폴리오 / 데모 호스팅)

로컬과 달리 **origin·API URL을 맞춰야** cookie 인증과 WebSocket이 동작합니다.

| 구분 | 설정 |
| --- | --- |
| API | `NODE_ENV=production`, `FRONTEND_URL=https://<프론트-도메인>`, `APP_BASE_URL=https://<API-도메인>` |
| Web | 빌드 시 `VITE_API_URL=https://<API-도메인>` |
| DB | `prisma migrate deploy` |
| Cookie | production에서 `secure: true` (HTTPS 필수) |

CORS/WebSocket은 `apps/api/src/main.ts`, `withdraw.gateway.ts`에서 **`FRONTEND_URL`** 을 읽습니다. 배포 URL로 `.env`만 바꾸면 됩니다.

**아직 README만으로 “빈 DB clone → 즉시 6종 지갑 시연”은 불가**합니다. 배포 시 provisioning된 DB 또는 dump를 함께 준비하세요.

---

## Root scripts

| 명령어 | 설명 |
| --- | --- |
| `npm run dev:api` | 백엔드 개발 서버 (watch) |
| `npm run dev:web` | 프론트엔드 개발 서버 |
| `npm run build:api` | 백엔드 프로덕션 빌드 |
| `npm run build:web` | 프론트엔드 프로덕션 빌드 |

### 유지보수 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `scripts/delete-sss.ts` | SSS 지갑 및 관련 레코드 **일괄 삭제** (실수 실행 주의) |

```bash
npm --workspace apps/api exec ts-node -- ../../scripts/delete-sss.ts
```

---

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) — PR/Push 시 API/Web lint(경고만), unit test, build.  
DB e2e는 CI 제외 → 로컬 `npm run test:e2e`.

---

## 배포 전 체크리스트

- [ ] `.env` 필수 변수 + DFNS PEM 경로
- [ ] `FRONTEND_URL` / `VITE_API_URL` 배포 도메인 반영
- [ ] provisioning된 DB (6종 지갑 + 테스트 계정)
- [ ] Sepolia 테스트넷 전용임을 README/데모에서 명시
- [ ] SSS 공개 샤드는 **데모 의도**임을 이해 (운영 금지)

**코드·테스트·빌드 기준으로는 배포 가능한 수준**입니다. 리뷰어가 clone만으로 전체 시연하려면 **DB provisioning 안내**가 핵심입니다.
