-- ROI на сделку отдельно для режима «План».
ALTER TABLE "risk_settings" ADD COLUMN "forecastPlanTradeRoiPercent" DOUBLE PRECISION;

UPDATE "risk_settings"
SET "forecastPlanTradeRoiPercent" = "forecastTradeRoiPercent"
WHERE "forecastPlanTradeRoiPercent" IS NULL
  AND "forecastTradeRoiPercent" IS NOT NULL;
