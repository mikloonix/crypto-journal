# Подэтап 4.1 — Кросс-маржа и совокупный риск

Цель: дополнить этап 4 расчётами, релевантными для **кросс-маржи**, когда риск по одной позиции нельзя оценивать изолированно.

Родительский документ: `04-stage-risk-management.md`.

## Definition of Done

- [ ] В `RiskSettings` (или связанной модели) учтены режим маржи и параметры кросс-маржи (см. ниже)
- [ ] Реализован расчёт совокупного риска кросс-маржи (формула согласована с продуктом)
- [ ] UI `/risk`: карточка совокупного риска, индикация по порогам
- [ ] UI: таблица/блок по открытым позициям — цена ликвидации при сценариях падения (например 5% / 10% / 15%) или эквивалентный «what-if»
- [ ] Документированы входные данные для расчёта (баланс, изолированная маржа, заблокированные активы, нереализованный PnL по кросс-позициям)

## Модель данных (расширение)

Пример полей для `RiskSettings`:

- `marginMode` — `CROSS` | `ISOLATED`
- `crossMaintenanceMargin` — поддерживающая маржа (типично доля от позиции)
- `crossCloseFeePct` — оценка комиссии закрытия
- `maxCrossRiskPct` — лимит совокупного риска кросс-позиций от баланса

Точные имена полей согласовать с миграцией Prisma на этапе 4.

## Расчёт (концепт)

```ts
interface CrossMarginRiskInput {
  balance: number
  isolatedMarginSum: number
  lockedAssets: number
  unrealizedPnLCross: number
  crossPositions: Array<{
    maintenanceMargin: number
    closeFee: number
  }>
}

function calcCrossMarginRiskPct(input: CrossMarginRiskInput): number {
  const totalMaintenanceMargin = input.crossPositions.reduce((s, p) => s + p.maintenanceMargin, 0)
  const totalCloseFees = input.crossPositions.reduce((s, p) => s + p.closeFee, 0)
  const denominator =
    input.balance - input.isolatedMarginSum - input.lockedAssets + input.unrealizedPnLCross
  if (denominator <= 0) return 100
  return ((totalMaintenanceMargin + totalCloseFees) / denominator) * 100
}
```

Уточнение формул под конкретную биржу (BingX) — в рамках этапа 5 при наличии спецификаций API.

## Тест-план

- Искусственный набор позиций → ожидаемый % риска
- Переключение `ISOLATED` / `CROSS` меняет отображаемые метрики
- Пороговые предупреждения срабатывают при превышении `maxCrossRiskPct`
