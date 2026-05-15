-- CreateEnum
CREATE TYPE "CashflowType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER');

-- CreateTable
CREATE TABLE "cashflows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CashflowType" NOT NULL,
    "accountId" TEXT,
    "fromAccountId" TEXT,
    "toAccountId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DOUBLE PRECISION,
    "fee" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashflows_userId_timestamp_idx" ON "cashflows"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "cashflows_userId_accountId_idx" ON "cashflows"("userId", "accountId");

-- CreateIndex
CREATE INDEX "cashflows_userId_fromAccountId_idx" ON "cashflows"("userId", "fromAccountId");

-- CreateIndex
CREATE INDEX "cashflows_userId_toAccountId_idx" ON "cashflows"("userId", "toAccountId");

-- AddForeignKey
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
