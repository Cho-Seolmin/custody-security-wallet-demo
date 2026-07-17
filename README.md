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
| 인증 | httpOnly cookie JWT, verify-email URL(SMTP 없음), 0.01 ETH+ OTP |
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
├── packages/    # workspace 예약 (현재 shared 패키지 미사용)
├── contracts/   # PolicyGuard 온체인 컨트랙트 (Solidity)
└── docs/        # SSS 데모 복구 가이드 등
```

---

## Quick Start (로컬)

### 1. 최소 기동 요구사항

서버 프로세스가 **부팅되려면** 아래가 모두 필요합니다.

- Node.js 20+
- PostgreSQL
- `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL`, `FRONTEND_URL`
- `SEPOLIA_RPC_URL` + `BACKEND_SIGNER_PRIVATE_KEY` (`SignerService`)
- `AWS_REGION` + `AWS_KMS_KEY_ID` (+ IAM) (`KmsService`)
- DFNS 관련 env + credential PEM (`MpcService`)

> API는 부팅 시 `SignerService`, `KmsService`, `MpcService`를 **항상 초기화**합니다.  
> Settings의 “연결 안 됨”은 **런타임 헬스체크** 결과이며, env 미설정과는 별개입니다.

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

[`apps/api/.env.example`](apps/api/.env.example)의 **부팅 필수 항목**을 채웁니다. 상세는 [`apps/api/README.md#environment-variables`](apps/api/README.md#environment-variables).

프론트:

| 변수 | 용도 |
| --- | --- |
| `VITE_API_URL` | API/WebSocket base (기본 `http://localhost:3000`) |
| `VITE_SEPOLIA_RPC_URL` | SSS 브라우저 서명용 Sepolia RPC (**SSS 시연에 필요**) |

### 4. DB 마이그레이션

```bash
npm --workspace apps/api exec prisma migrate dev
```

### 5. 데모 데이터 (호스팅 데모 vs 신규 clone)

**seed 스크립트는 의도적으로 포함하지 않습니다.**  
KMS / DFNS / 온체인 PolicyVault / 펀딩된 Sepolia 주소는 외부 프로비저닝이 필요해, DB만으로 “6종 전부 동작”을 재현하는 seed는 오해를 부릅니다.

| 구분 | 가능 범위 |
| --- | --- |
| **호스팅 데모** | 사전 provisioning된 PostgreSQL(테스트 계정 + 6종 `Wallet` 레코드 + 외부 연동 완료)을 가정 |
| **신규 clone** | 마이그레이션까지는 가능. 로그인 UI의 `test@test.com` 등은 **DB에 직접 넣은 경우에만** 동작 |
| **회원가입만** | 계정은 생기지만 **지갑이 자동 생성되지 않음** → 6종 비교 시연 불가 |

외부 모델별 수동 준비(요약):

- BACKEND_SEC / MULTISIG: Backend Signer + (선택) whitelist
- POLICY_GUARD: 배포된 vault + `POLICY_VAULT_ADDRESS`
- KMS: AWS KMS 키 + IAM
- MPC: DFNS wallet + credential PEM
- SSS: 데모 DB의 SSS 주소가 [`docs/SSS_DEMO_RECOVERY.md`](docs/SSS_DEMO_RECOVERY.md) 공개 데모 지갑과 일치해야 시연 가능

### 6. 개발 서버

```bash
npm run dev:api   # http://localhost:3000 (PORT 있으면 그 값, 0.0.0.0 bind)
npm run dev:web   # http://localhost:5173
```

### 7. 테스트

```bash
npm --workspace apps/api run test       # 단위 테스트 (DB 불필요)
npm --workspace apps/api run test:e2e   # e2e (Postgres + .env 필요, CI 제외)
```

---

## 필수 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` | JWT + 계정별 OTP secret 파생 |
| `APP_BASE_URL` | verify-email URL 생성용 (SMTP 없음; register 응답의 `verifyUrl`) |
| `FRONTEND_URL` | CORS + WebSocket origin |
| `SEPOLIA_RPC_URL` | Sepolia JSON-RPC |
| `BACKEND_SIGNER_PRIVATE_KEY` | BACKEND_SEC / MULTISIG / POLICY_GUARD / SSS broadcast 등 |
| `POLICY_VAULT_ADDRESS` | POLICY_GUARD vault 컨트랙트 (출금 실행 시) |
| `AWS_REGION`, `AWS_KMS_KEY_ID` (+ IAM 자격) | KMS 지갑 |
| `DFNS_*`, `DFNS_PRIVATE_KEY_PATH` | MPC(DFNS) 지갑 |
| `PORT` | (선택) listen 포트. 미설정 시 3000 |

프론트: `VITE_API_URL`, `VITE_SEPOLIA_RPC_URL`

---

## 인증·회원가입 (로직 요약)

```text
POST /auth/register → User(status=PENDING) + verify-email JWT
GET  /auth/verify-email?token=... → status=ACTIVE
POST /auth/login → httpOnly accessToken cookie (type=access)
GET  /auth/me → 세션 확인 (프론트 ProtectedRoute)
```

- 실제 이메일 발송 없음. register 응답의 `verifyUrl` / UI 인증 버튼으로만 ACTIVE 전환
- verify-email JWT는 **API 인증에 사용 불가** (`JwtStrategy`에서 차단)
- PENDING 사용자는 **10분 후 cron**으로 삭제 (미인증 가입 정리)
- 회원가입 비밀번호: **8자 이상** / 로그인 화면 테스트 계정은 **프로비저닝 DB 전제**의 데모용 짧은 비밀번호일 수 있음

---

## SSS Demo (Sepolia)

포트폴리오 시연을 위해 **고정 데모 지갑의 3/5 샤드를 문서에 공개**합니다. (신규 지갑마다 발급되는 값이 아님)

- **[SSS Demo Recovery Guide](docs/SSS_DEMO_RECOVERY.md)**
- 오프라인 도구: [`apps/api/tools/offline-sss-recovery/`](apps/api/tools/offline-sss-recovery/)

흐름: 오프라인 `npm run recover` → private key → 웹 UI **브라우저에서 signedTx 생성** → 서버 검증·Queue → Worker broadcast.  
**private key는 서버로 전송되지 않습니다.** 요청 성공 후 클라이언트 입력란은 비워집니다. 복구된 키는 문서에 적지 마세요.

---

## 배포 (포트폴리오 / 데모 호스팅)

| 구분 | 설정 |
| --- | --- |
| API | `NODE_ENV=production`, `FRONTEND_URL=https://<프론트-도메인>`, `APP_BASE_URL=https://<API-도메인>`, `PORT`는 호스트 주입값 사용 |
| Web | 빌드 시 `VITE_API_URL=https://<API-도메인>`, SSS면 `VITE_SEPOLIA_RPC_URL` |
| DB | `prisma migrate deploy` + **pre-provisioned** 데모 데이터 |
| Cookie | production: `httpOnly` + `secure: true` + `sameSite: 'none'` (크로스 사이트 front/API + HTTPS 전제) |
| CORS / WS | `FRONTEND_URL` 단일 origin + `credentials: true` (`*` 사용 안 함) |

로컬 예:

```env
FRONTEND_URL=http://localhost:5173
```

프로덕션 예:

```env
FRONTEND_URL=https://your-frontend-domain.example
```

프론트·API를 **서로 다른 site**에 두고 cookie 인증을 쓰려면 위 production cookie 설정과 HTTPS가 필요합니다.  
동일 origin 리버스 프록시를 쓰면 배포가 더 단순합니다.

**빈 DB clone → 즉시 6종 지갑 시연은 불가**합니다. 호스팅 데모는 provisioning된 DB를 전제로 하세요.

---

## Root scripts

| 명령어 | 설명 |
| --- | --- |
| `npm run dev:api` | 백엔드 개발 서버 (watch) |
| `npm run dev:web` | 프론트엔드 개발 서버 |
| `npm run build:api` | 백엔드 프로덕션 빌드 |
| `npm run build:web` | 프론트엔드 프로덕션 빌드 |

---

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) — PR/Push 시 API/Web lint(경고만), unit test, build.  
DB e2e는 CI 제외 → 로컬 `npm run test:e2e`.

---

## 배포 전 체크리스트

- [ ] `.env` 부팅 필수 변수 + DFNS PEM 경로
- [ ] `FRONTEND_URL` / `VITE_API_URL` / (SSS) `VITE_SEPOLIA_RPC_URL` 배포 값
- [ ] `NODE_ENV=production` + HTTPS (cookie `secure` + `sameSite=none`)
- [ ] provisioning된 DB (6종 지갑 + 테스트 계정) 또는 호스팅 dump
- [ ] Sepolia 테스트넷 전용 · SSS 공개 샤드는 **데모 의도**

리뷰어가 clone만으로 전체 시연하려면 **DB provisioning + 외부 연동**이 핵심입니다.
