-- Этап 4.5: параметры прогноза на risk_settings (без отдельной таблицы)
ALTER TABLE "risk_settings" ADD COLUMN "forecastDepositTargetUsdt" DOUBLE PRECISION,
ADD COLUMN "forecastTradeRoiPercent" DOUBLE PRECISION,
ADD COLUMN "forecastDeadlineYmd" TEXT;
