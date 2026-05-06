-- Этап 3: часовой пояс приложения (IANA) для аналитики и дневных метрик
ALTER TABLE "risk_settings" ADD COLUMN "displayTimeZone" TEXT NOT NULL DEFAULT 'UTC';

CREATE INDEX "trades_user_status_closed_at_idx" ON "trades" ("userId", "status", "closedAt");
