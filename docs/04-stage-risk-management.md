# Этап 4 — Риск-менеджмент (правила + подсветка нарушений)



Цель этапа: добавить реальную пользу для фьючерсной торговли — расчет риска для открытых позиций и правила, которые предотвращают “слив”.



**Подэтап 4.1 (кросс-маржа, совокупный риск, push):** `04_1-stage-cross-margin-risk.md`.



## Статус: ✅ выполнен (MVP)



Дата закрытия MVP: 2026-05. Автотесты из тест-плана — этап **5.5**.



## Решения (зафиксировано)



- **Скоуп:** только этап 4; 4.1 отдельно.

- **`Entry.volume` / `Exit.volume`:** маржа в **USDT** (вариант B); номинал = маржа × плечо; PnL через объём контракта `margin × leverage / price` — модуль `src/server/trading/position-margin.ts`.

- **Стоп:** `Trade.stopLossPrice` (один на сделку).

- **Депозит:** ручной `RiskSettings.accountBalance` + кнопка синхронизации с equity портфеля (`POST /api/settings/risk/sync-balance`).

- **FUTURE без стопа:** warning + бейдж HIGH, без блокировки POST.

- **SPOT:** стоп опционален, риск-правила не применяются.

- **Дневной риск:** реализованный + нереализованный (котировки BingX — этап 5; до этого ручная mark price на дашборде).

- **`maxDrawdown`:** предупреждение по просадке equity.

- **UI настроек:** только `/risk` (без дубля в `/settings`).



## Definition of Done



- [x] Пользователь настраивает: депозит, риск на сделку/день, max drawdown, max open risk — `/risk`

- [x] Для каждой **открытой** сделки: риск в $ и % — `trade.risk` в журнале

- [x] Подсветка нарушений — бейджи `OK` / `HIGH` / `NA`, `reasons[]`

- [x] API + UI для `RiskSettings`

- [x] `stopLossPrice` на `Trade`, PATCH из журнала OPEN

- [x] Dashboard: open risk, риск за день, просадка, предупреждения

- [x] Ручные mark prices → пересчёт риска (панель усреднения, debounce ~0,4 с)

- [ ] Автотесты из тест-плана — отложены на этап 5.5



## Реализация (код)



| Область | Путь |

|--------|------|

| Движок риска | `src/server/trading/risk-evaluation.ts`, `attach-journal-risk.ts` |

| Маржа / PnL | `position-margin.ts` (`contractQtyFromExitMargin` — qty выхода по **средней цене входа**, не по цене выхода), `trade-pnl.ts`, `exit-leg-pnl.ts` |

| API настроек | `GET/PATCH /api/settings/risk`, `POST /api/settings/risk/sync-balance` |

| Оценка с mark | `POST /api/risk/evaluate` |

| Стоп сделки | `PATCH /api/trades/[id]` (`stopLossPrice`) |

| UI | `/risk`, дашборд (`dashboard-summary-cards`, `open-trades-table`, усреднение) |

| Контракты | `src/contracts/risk.ts`, поле `risk` в `src/contracts/trades.ts` |



Миграция: `prisma/migrations/20260516100000_stage4_trade_stop_loss` (`trades.stopLossPrice`).



## Модель данных



`RiskSettings` в Prisma:



- `accountBalance` — депозит для %

- `riskPerTrade`, `riskPerDay`, `maxDrawdown`, `maxOpenRisk` — проценты (0..100)



`Trade.stopLossPrice` — опционально, один стоп на сделку.



Дневной риск считается на лету (без таблицы `DailyRisk`).



## Расчеты риска (MVP)



- Средняя цена входа по `Entry`

- Риск USDT: расстояние до стопа × позиция (см. `risk-evaluation.ts` + `position-margin.ts`)

- Риск % = risk / `accountBalance` × 100



Правила:



- риск% > `riskPerTrade` → warning / HIGH

- сумма рисков OPEN > `maxOpenRisk` → warning

- дневной риск (реализованные потери + нереализованный при mark) > `riskPerDay` → warning

- просадка equity > `maxDrawdown` → warning



## UI/UX



- `/risk` — настройки, синхронизация баланса, калькулятор маржи от риска

- Журнал OPEN: колонки Risk/Stop, сохранение стопа

- Dashboard: карточки **Депозит** / **PnL** / ROI; «Цена сейчас» в панели усреднения → `POST /api/risk/evaluate` (debounce ~0,4 с)
- Закрытые (`/trades/closed`): колонки **ROI** (от маржи позиции) и **ROI деп.** (PnL / `initialDepositUsdt` журнала)



## Prisma: baseline существующей БД



Если БД уже создана (`db push` / вручную) и `migrate deploy` выдаёт **P3005**, один раз пометить все миграции как применённые (порядок — по имени папки):



```bash

npx prisma migrate resolve --applied 20260207120000_stage3_display_timezone

# … остальные из prisma/migrations/

npx prisma migrate deploy

```



После baseline новые миграции применяются обычным `npx prisma migrate deploy`.



## Тест-план (ручной)



- OPEN со stopLoss выше лимита → бейдж HIGH

- Изменить `/risk` → пересчёт в журнале

- Ввести mark price на дашборде → обновление daily risk / unrealized

- Настройки изолированы по `userId`



## Риски / вне scope этапа 4



- Без stop-loss на FUTURE — только предупреждение (не блокировка)

- Котировки BingX, push, кросс-маржа — этап **4.1**

- Unit-тесты — этап **5.5**

