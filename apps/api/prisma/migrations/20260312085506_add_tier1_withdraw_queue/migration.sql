/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `WithdrawRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'RESERVED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'DEAD');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM', 'WORKER', 'SIGNER');

-- CreateEnum
CREATE TYPE "AdminApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WithdrawStatus" ADD VALUE 'APPROVED';
ALTER TYPE "WithdrawStatus" ADD VALUE 'QUEUED';
ALTER TYPE "WithdrawStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "WithdrawRequest" ADD COLUMN     "broadcastedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "executionType" "WalletType",
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "nonce" INTEGER,
ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "riskDecision" TEXT,
ADD COLUMN     "riskScore" INTEGER;

-- CreateTable
CREATE TABLE "WithdrawalQueue" (
    "id" TEXT NOT NULL,
    "withdrawRequestId" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalAuditLog" (
    "id" TEXT NOT NULL,
    "withdrawRequestId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "message" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminApproval" (
    "id" TEXT NOT NULL,
    "withdrawRequestId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "decision" "AdminApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSecurityState" (
    "walletId" TEXT NOT NULL,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "withdrawPaused" BOOLEAN NOT NULL DEFAULT false,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastWithdrawAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSecurityState_pkey" PRIMARY KEY ("walletId")
);

-- CreateTable
CREATE TABLE "AddressBlacklist" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalQueue_withdrawRequestId_key" ON "WithdrawalQueue"("withdrawRequestId");

-- CreateIndex
CREATE INDEX "WithdrawalQueue_status_availableAt_idx" ON "WithdrawalQueue"("status", "availableAt");

-- CreateIndex
CREATE INDEX "WithdrawalAuditLog_withdrawRequestId_createdAt_idx" ON "WithdrawalAuditLog"("withdrawRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalAuditLog_walletId_createdAt_idx" ON "WithdrawalAuditLog"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalAuditLog_eventType_createdAt_idx" ON "WithdrawalAuditLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminApproval_withdrawRequestId_createdAt_idx" ON "AdminApproval"("withdrawRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminApproval_adminUserId_createdAt_idx" ON "AdminApproval"("adminUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBlacklist_address_key" ON "AddressBlacklist"("address");

-- CreateIndex
CREATE INDEX "AddressBlacklist_address_isActive_idx" ON "AddressBlacklist"("address", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawRequest_idempotencyKey_key" ON "WithdrawRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WithdrawRequest_walletId_createdAt_idx" ON "WithdrawRequest"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawRequest_toAddress_idx" ON "WithdrawRequest"("toAddress");

-- AddForeignKey
ALTER TABLE "WithdrawalQueue" ADD CONSTRAINT "WithdrawalQueue_withdrawRequestId_fkey" FOREIGN KEY ("withdrawRequestId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAuditLog" ADD CONSTRAINT "WithdrawalAuditLog_withdrawRequestId_fkey" FOREIGN KEY ("withdrawRequestId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAuditLog" ADD CONSTRAINT "WithdrawalAuditLog_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminApproval" ADD CONSTRAINT "AdminApproval_withdrawRequestId_fkey" FOREIGN KEY ("withdrawRequestId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminApproval" ADD CONSTRAINT "AdminApproval_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletSecurityState" ADD CONSTRAINT "WalletSecurityState_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
