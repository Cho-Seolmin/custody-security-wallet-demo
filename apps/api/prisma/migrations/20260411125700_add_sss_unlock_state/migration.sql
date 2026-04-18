-- CreateEnum
CREATE TYPE "SssUnlockState" AS ENUM ('LOCKED', 'UNLOCKED_ONCE');

-- AlterTable
ALTER TABLE "WalletSecurityState" ADD COLUMN     "sssUnlockExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sssUnlockState" "SssUnlockState" NOT NULL DEFAULT 'LOCKED';
