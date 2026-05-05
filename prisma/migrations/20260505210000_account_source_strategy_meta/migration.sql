-- CreateEnum
CREATE TYPE "AccountSource" AS ENUM ('MANUAL', 'BINGX');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "source" "AccountSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "strategies" ADD COLUMN "timeframe" TEXT,
ADD COLUMN "setup" TEXT,
ADD COLUMN "riskNote" TEXT;
