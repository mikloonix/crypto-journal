-- Stage 2.5: Account, Strategy, Emotion; Trade.accountId; RiskSettings.activeAccountId

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emotions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "risk_settings" ADD COLUMN "activeAccountId" TEXT;

ALTER TABLE "trades" ADD COLUMN "accountId" TEXT;

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strategies" ADD CONSTRAINT "strategies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emotions" ADD CONSTRAINT "emotions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_settings" ADD CONSTRAINT "risk_settings_activeAccountId_fkey" FOREIGN KEY ("activeAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

CREATE UNIQUE INDEX "strategies_userId_name_key" ON "strategies"("userId", "name");

CREATE INDEX "strategies_userId_idx" ON "strategies"("userId");

CREATE UNIQUE INDEX "emotions_userId_name_key" ON "emotions"("userId", "name");

CREATE INDEX "emotions_userId_idx" ON "emotions"("userId");

CREATE INDEX "trades_userId_accountId_idx" ON "trades"("userId", "accountId");
