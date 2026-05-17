-- AlterEnum
ALTER TYPE "WithdrawStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "WithdrawRequest" ADD COLUMN     "expiresAt" TIMESTAMP(3);
