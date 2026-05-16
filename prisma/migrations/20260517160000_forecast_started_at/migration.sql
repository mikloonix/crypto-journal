-- Этап 4.5: дата старта прогноза и снимок на момент постановки цели (онлайн).
ALTER TABLE "risk_settings" ADD COLUMN "forecastStartedAtYmd" TEXT;
ALTER TABLE "risk_settings" ADD COLUMN "forecastStartEquityUsdt" DOUBLE PRECISION;
ALTER TABLE "risk_settings" ADD COLUMN "forecastStartTradesToGoal" INTEGER;
