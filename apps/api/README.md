# Custody Security Wallet Demo

보안 중심 커스터디 지갑 데모 프로젝트입니다.

다양한 키 관리 모델(Backend Signer, Multisig, Policy Guard, AWS KMS, MPC, SSS)을 하나의 플랫폼에서 비교할 수 있도록 구현했으며, 출금 요청 생성부터 승인, Queue 처리, Worker 실행, Audit Log 기록, 실시간 상태 반영까지 백엔드 중심으로 설계했습니다.

---

# Overview

Custody Security Wallet Demo는 단순 지갑 CRUD 프로젝트가 아닌, 실제 금융 및 커스터디 서비스에서 사용되는 출금 처리 워크플로우를 학습하고 구현하기 위한 프로젝트입니다.

출금 요청은 즉시 실행되지 않고 Queue 기반 비동기 파이프라인을 통해 처리되며, Worker, Scheduler, WebSocket, Audit Log를 활용하여 안정성과 추적성을 확보했습니다.

## 핵심 목표

* 다양한 Wallet Security Model 비교
* Queue 기반 비동기 출금 처리
* 실시간 상태 동기화
* Audit Trail 구축
* 출금 정책 및 승인 프로세스 구현
* 외부 키 관리 시스템(KMS / MPC) 연동

---

# Architecture

## System Architecture

```mermaid
flowchart TD
    USER[User and Admin]
    WEB[React Frontend]
    API[NestJS API]

    WALLET[WalletService]
    ADMIN[AdminService]

    POLICY[PolicyEngine]
    QUEUE[QueueService]

    WORKER[WithdrawalWorker]
    ROUTER[ExecutionRouter]

    AUDIT[AuditLog Service]
    WS[WithdrawGateway]

    SCHEDULER[Multisig Scheduler]

    DB[(PostgreSQL)]

    BACKEND[BackendSec Executor]
    POLICYEX[PolicyGuard Executor]
    KMS[KMS Executor]
    MPC[MPC Executor]
    SSS[SSS Executor]

    SIGNER[Backend Signer]
    VAULT[PolicyVault Contract]
    AWS[AWS KMS]
    DFNS[DFNS MPC]

    SEPOLIA[Sepolia]

    USER --> WEB
    WEB --> API
    WEB <--> WS

    API --> WALLET
    API --> ADMIN

    WALLET --> POLICY
    WALLET --> QUEUE
    WALLET --> DB

    ADMIN --> QUEUE
    ADMIN --> DB

    WORKER --> QUEUE
    WORKER --> ROUTER
    WORKER --> AUDIT
    WORKER --> WS
    WORKER --> DB

    SCHEDULER --> DB
    SCHEDULER --> AUDIT
    SCHEDULER --> WS

    ROUTER --> BACKEND
    ROUTER --> POLICYEX
    ROUTER --> KMS
    ROUTER --> MPC
    ROUTER --> SSS

    BACKEND --> SIGNER
    POLICYEX --> VAULT
    KMS --> AWS
    MPC --> DFNS
    SSS --> SEPOLIA
   

    SIGNER --> SEPOLIA
    VAULT --> SEPOLIA
    AWS --> SEPOLIA
    DFNS --> SEPOLIA
    SSS --> SEPOLIA

    AUDIT --> DB
```

사용자는 React 프론트엔드를 통해 출금 요청을 생성합니다.

출금 요청은 Queue에 등록되고 Worker가 비동기로 처리됩니다.
ExecutionRouter는 walletType에 따라 적절한 Executor를 선택하며,
실행 결과는 AuditLog에 기록되고 WebSocket 이벤트를 통해 실시간으로 프론트에 반영됩니다.

이를 통해 출금 요청 생성과 실제 송금 실행을 분리하여 안정성과 확장성을 확보했습니다.
또한 WalletType별 Executor 분리를 통해 새로운 지갑 타입을 최소한의 수정으로 확장할 수 있도록 설계했습니다.

---

## Withdrawal Processing Flow

```mermaid
sequenceDiagram
    actor User

    participant API
    participant WalletService
    participant Queue
    participant Worker
    participant Router
    participant Executor
    participant Chain
    participant WS

    User->>API: Withdraw Request

    API->>WalletService: withdraw()

    WalletService->>WalletService: OTP Check
    WalletService->>WalletService: Policy Validation

    alt MULTISIG
        WalletService->>WalletService: Create PENDING Request
        Note over WalletService: Wait Admin Approval
    else Other Wallet Types
        WalletService->>Queue: enqueue()
    end

    Worker->>Queue: reserveNext()
    Queue-->>Worker: Job

    Worker->>Worker: PROCESSING

    Worker->>Router: execute()

    Router->>Executor: walletType Executor

    Executor->>Chain: Send Transaction

    alt Success
        Chain-->>Executor: txHash
        Executor-->>Worker: ONCHAIN_TX
        Worker->>WS: withdraw.updated
    else External Pending
        Executor-->>Worker: EXTERNAL_PENDING
    else Failure
        Worker->>Queue: Retry or Dead
        Worker->>WS: withdraw.updated
    end
```

출금 요청은 Queue 기반 비동기 구조로 처리됩니다. MULTISIG는 관리자 승인 이후 Queue에 등록되며, 나머지 지갑 타입은 즉시 Queue에 등록됩니다. Worker는 Queue를 polling하며 ExecutionRouter를 통해 walletType별 Executor를 선택하고, 결과를 WebSocket으로 전달합니다.

---

## Database ERD

```mermaid
erDiagram

    User ||--o{ Wallet : owns

    Wallet ||--o{ WithdrawRequest : creates

    WithdrawRequest ||--|| WithdrawalQueue : queued

    WithdrawRequest ||--o{ WithdrawalAuditLog : logs

    WithdrawRequest ||--o{ AdminApproval : approvals

    User ||--o{ AdminApproval : performs

    Wallet {
        string id
        string userId
        string walletType
        string address
    }

    User {
        string id
        string email
        string role
    }

    WithdrawRequest {
        string id
        string walletId
        string amount
        string toAddress
        string status
        string txHash
        string idempotencyKey
    }

    WithdrawalQueue {
        string id
        string withdrawRequestId
        string status
        int attemptCount
    }

    WithdrawalAuditLog {
        string id
        string withdrawRequestId
        string eventType
        string actorType
    }

    AdminApproval {
        string id
        string withdrawRequestId
        string adminUserId
        string decision
    }
```

핵심 출금 도메인은 User → Wallet → WithdrawRequest 구조를 중심으로 설계했습니다. WithdrawRequest는 Queue를 통해 비동기 처리되며, 모든 상태 변경은 AuditLog에 기록됩니다. MULTISIG 지갑은 AdminApproval을 통해 승인 이력을 관리합니다.


# Tech Stack

## Frontend

* React
* Vite
* TypeScript
* Axios
* Socket.IO Client

## Backend

* NestJS
* TypeScript
* Prisma
* PostgreSQL
* JWT
* bcrypt
* Scheduler
* WebSocket
* Queue / Worker

## Blockchain

* ethers v6
* Solidity
* Hardhat
* Sepolia

---

# 주요 기능

## 1. 6가지 보안 지갑 모델

지원 지갑 타입

* BACKEND_SEC
* MULTISIG
* POLICY_GUARD
* KMS
* MPC
* SSS

각 지갑은 서로 다른 보안 모델과 출금 흐름을 가집니다.

### BACKEND_SEC

화이트리스트 기반 출금 제어 지갑입니다.

등록된 주소로만 출금할 수 있으며, Policy Engine을 통해 출금 정책을 검증합니다.

### MULTISIG

관리자 2-of-2 승인 기반 지갑입니다.

사용자가 출금 요청을 생성하면 PENDING 상태가 되며, 관리자 2명이 승인하면 Queue에 등록됩니다.

10분 내 승인이 완료되지 않으면 자동 만료됩니다.

### POLICY_GUARD

온체인 PolicyVault 컨트랙트를 통해 출금 정책을 검증하는 지갑입니다.

출금 시 스마트 컨트랙트의 withdraw() 함수를 호출합니다.

### KMS

AWS KMS 기반 외부 키 관리 지갑입니다.

KMS 서명을 통해 트랜잭션을 생성하고 브로드캐스트합니다.

### MPC

MPC 지갑은 외부 분산 서명 제공자와 연동 가능한 구조로 구현했습니다.

* MpcService
* MpcExecutor
* ExecutionRouter

를 분리하여 다른 지갑 타입과 독립적으로 출금 흐름을 관리합니다.

MpcSettlementService는 DFNS transfer 상태를 주기적으로 조회하여 Confirmed 상태이면 WithdrawRequest를 EXECUTED로, Failed / Rejected / Cancelled 상태이면 FAILED로 동기화합니다.

현재 데모에서는 DFNS를 MPC Provider로 사용합니다.

### SSS

Shamir's Secret Sharing 기반 지갑입니다.

* 3-of-5 Secret Sharing
* Client-side Transaction Signing
* Backend Signed Transaction Validation
* Signed Transaction Broadcast via Worker

복구된 private key는 브라우저에서만 사용되며,
서버는 signedTx만 수신하며, 원문 private key는 API 요청 본문이나 DB metadata에 저장되지 않습니다.

서버는 signedTx의 signer, recipient, amount, chainId, nonce를 검증한 후 Queue에 등록합니다.

---

# Queue / Worker 기반 출금 처리

출금 요청은 즉시 실행되지 않고 Queue를 통해 비동기 처리됩니다.

```text
WithdrawRequest 생성
→ WithdrawalQueue 등록
→ Worker Polling
→ ExecutionRouter
→ WalletType Executor
→ 상태 업데이트
→ AuditLog 기록
```

## Worker Processing Model

Worker는 5초마다 Queue를 Polling합니다.

정상 처리 흐름

```text
PENDING
→ RESERVED
→ RUNNING
→ SUCCEEDED
```

해당 상태는 WithdrawalQueue 기준 상태이며,
WithdrawRequest 상태는 QUEUED → PROCESSING → EXECUTED 또는 FAILED 로 관리됩니다.

실패 처리 흐름

```text
RUNNING
→ RETRY_WAIT
→ DEAD
```

재시도는 최대 3회 수행됩니다.

---

# MULTISIG 자동 만료 Scheduler

MULTISIG 출금 요청은 10분 내 승인되지 않으면 자동 만료됩니다.

Scheduler는 1분마다 다음 조건을 확인합니다.

```text
status = PENDING
expiresAt < now
```

조건을 만족하면:

```text
status = EXPIRED
failureReason = "Multisig approval expired"
finalizedAt = now
```

로 변경됩니다.

---

# WebSocket 기반 실시간 상태 반영

출금 상태가 변경되면 WebSocket 이벤트를 프론트로 전송합니다.

이벤트 이름

```text
withdraw.updated
```

프론트는 이벤트 수신 시 상태를 직접 수정하지 않고 기존 API를 재조회합니다.

```text
withdraw.updated 수신
→ 출금 이력 API 재조회
→ UI 갱신
```

이를 통해 상태 불일치를 줄이고 API를 Single Source of Truth로 유지했습니다.

---

# Idempotency-Key 기반 중복 출금 방지

출금 API는 Idempotency-Key 헤더를 사용합니다.

```text
첫 요청
→ WithdrawRequest 생성
→ idempotencyKey 저장

동일 키 재요청
→ 기존 요청 반환
→ Queue 재생성 방지
→ 중복 송금 방지
```

---

# Risk-Based OTP 인증

0.01 ETH 이상 출금 시 Google Authenticator 기반 OTP 인증을 요구합니다.

```text
0.01 ETH 미만
→ OTP 불필요

0.01 ETH 이상
→ OTP 필수
```

OTP 검증 실패 시 출금 요청은 생성되지 않습니다.

---

# 프론트 중복 클릭 방지

UX 차원의 중복 요청 방지를 위해 출금 버튼 클릭 후 3초 동안 재클릭을 차단합니다.

```text
출금 버튼 클릭
→ 버튼 비활성화
→ 3초 차단
```

백엔드 Idempotency-Key와 함께 적용하여 중복 요청을 최소화했습니다.

---

# Audit Log

출금 처리 과정의 주요 이벤트를 DB에 기록합니다.

예시 이벤트

* REQUEST_CREATED
* QUEUED
* EXECUTION_STARTED
* TX_CONFIRMED
* TX_FAILED
* RETRY_SCHEDULED
* EXPIRED

이를 통해 출금 이력을 추적하고 장애 분석에 활용할 수 있습니다.

---

# Design Decisions

## ExecutionRouter 도입

WalletType별 출금 로직을 Strategy Pattern 형태로 분리했습니다.

이를 통해 새로운 WalletType 추가 시 Worker 코드를 수정하지 않고 Executor만 추가할 수 있습니다.

## Queue 기반 처리

출금 요청과 실제 송금을 분리하여

* API 응답 시간 단축
* Retry 지원
* 상태 추적
* Audit 기록

이 가능하도록 설계했습니다.

## WebSocket + API 재조회

WebSocket은 상태 변경 사실만 전달합니다.

실제 데이터는 API를 다시 조회하도록 구현하여 상태 불일치 가능성을 줄였습니다.

---

# Limitations & Future Improvements

## SSS

현재 데모에서는 Client-side Signing 방식을 사용합니다.

복구된 private key는 브라우저에서만 사용되며 서버로 전송되지 않습니다.

실제 운영 환경에서는 다음과 같은 추가 보안이 필요합니다.

* Hardware Wallet
* HSM
* MPC
* Secure Key Recovery Process

## MPC

MPC 지갑은 DFNS 기반 외부 분산 서명 구조를 사용합니다.

구현 범위:

* DFNS Transfer 생성
* EXTERNAL_PENDING 처리
* MPC Settlement Polling
* DFNS Status 조회
* EXECUTED / FAILED 자동 동기화
* txHash 저장
* WebSocket 상태 반영

이를 통해 외부 MPC Provider 상태와 내부 WithdrawRequest 상태를 동기화합니다.

향후 확장 가능 항목:

* Multi-provider 지원
* Provider Failover
* Confirmation Depth 정책

## Queue

현재 Queue는 PostgreSQL 기반 Polling Worker 구조입니다.

향후 확장 시

* Redis
* BullMQ
* Distributed Worker

구조로 확장할 수 있습니다.

---

# Environment Variables

.env.example

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DB_NAME"
APP_BASE_URL="http://localhost:3000"

JWT_SECRET="change-me"
JWT_EXPIRES_IN="7d"

SEPOLIA_RPC_URL="https://ethereum-sepolia.publicnode.com"

BACKEND_SIGNER_ADDRESS="0x..."
BACKEND_SIGNER_PRIVATE_KEY="0x..."

POLICY_GUARD_ADDRESS="0x..."
POLICY_VAULT_ADDRESS="0x..."

AWS_REGION="ap-northeast-2"
AWS_KMS_KEY_ID="your-kms-key-id"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"

DFNS_BASE_URL="https://api.dfns.io"
DFNS_AUTH_TOKEN="..."
DFNS_WALLET_ID="..."
DFNS_NETWORK="EthereumSepolia"
DFNS_ORG_ID="your-org-id"
DFNS_CREDENTIAL_ID="your-credential-id"
DFNS_PRIVATE_KEY_PATH="/path/to/private_key.pem"

DEV_TOTP_SECRET=""
```
## Frontend .env.example

```env
VITE_API_URL="http://localhost:3000"
VITE_SEPOLIA_RPC_URL="https://ethereum-sepolia.publicnode.com"
```

실제 .env 파일은 Git에 포함하지 않습니다.

---

# 실행 방법

## Backend

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

## Frontend

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

---

# What I Learned

이 프로젝트를 통해 다음 내용을 학습하고 구현했습니다.

* Queue 기반 비동기 아키텍처
* Worker Polling 구조
* WebSocket 실시간 이벤트 처리
* Idempotency 기반 중복 요청 방지
* OTP 기반 Risk Authentication
* Audit Trail 설계
* AWS KMS 연동
* DFNS MPC 연동
* Smart Contract 기반 출금 정책 구현
* Multisig 승인 워크플로우
* Scheduler 기반 자동 만료 처리
* 다양한 키 관리 모델 비교
* Client-side Transaction Signing
* Signed Transaction Validation
