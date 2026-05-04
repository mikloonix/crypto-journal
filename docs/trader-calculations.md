# Трейдерские расчёты (единая спецификация)

Этот документ описывает **как именно** считаются метрики в приложении. Любые новые экраны или правки PnL/ROI должны опираться на эти формулы и на код в указанных модулях.

Исходники: `src/lib/risk-manager.ts`, `src/lib/exit-leg-pnl.ts`, `src/lib/bingx-fees.ts`, `app/dashboard/page.tsx`, `app/trades/closed/page.tsx`, `src/components/EquityChart.tsx`.

---

## Объёмы (маржа по ногам)

Для трейда с массивами входов `entries` и выходов `exits` (поле `volume` — маржа ноги, в валюте котировки пары):

- **Суммарная маржа входов:** `entryVolume = Σ entry.volume`
- **Суммарная маржа выходов:** `exitVolume = Σ exit.volume`
- **Остаток позиции (маржа):** `remainingVolume = entryVolume − exitVolume`

Функция: `calculateVolumes` в `risk-manager.ts`.

---

## Средневзвешенные цены

- **Средняя цена входа по трейду:**  
  `avgEntry = (Σ entry.price × entry.volume) / entryVolume` при `entryVolume > 0`.

- **Средняя цена по уже закрытой части (только ноги выхода):**  
  `avgExit = (Σ exit.price × exit.volume) / exitVolume` при `exitVolume > 0`.

В UI цены показываются **числом без суффикса валюты** (базовый актив в котировке пары). Маржа и PnL — с суффиксом котировки (`quoteCurrencyFromSymbol`).

---

## PnL закрытого трейда (целиком)

`calculateTradePnL(trade)`:

1. `totalEntryValue = Σ (entry.price × entry.volume)`
2. `totalExitValue = Σ (exit.price × exit.volume)`
3. `pnl = totalExitValue − totalEntryValue`
4. Если направление **SHORT**, знак инвертируется: `pnl = −pnl`
5. Вычитаются агрегаты по трейду: `pnl -= trade.fee`, `pnl -= trade.funding`

Используется для **полностью закрытых** трейдов и для суммарного PnL по истории на дашборде.

---

## Реализованный PnL (частичные выходы)

`calculateRealizedPnL(trade)` — для открытого трейда с уже совершёнными выходами:

1. Требуется `exitVolume > 0` и `entryVolume > 0`, иначе `0`.
2. `avgEntry`, `avgExit` — как выше по всему трейду.
3. `pnl = (avgExit − avgEntry) × exitVolume`; для **SHORT**: `pnl = −pnl`
4. Доля закрытого объёма: `ratio = min(1, exitVolume / entryVolume)`
5. Пропорционально вычитаются комиссия и фандинг трейда:  
   `pnl -= trade.fee × ratio`, `pnl -= trade.funding × ratio`

На дашборде в таблице открытых в колонке «PnL (реал.)» для **OPEN** показывается `calculateRealizedPnL`; для **CLOSED** в этой же таблице (если строка попадёт) — полный `calculateTradePnL`.

---

## PnL и ROI одной ноги выхода

`pnlRoiForExitLeg(direction, entries, exit)` в `exit-leg-pnl.ts`:

1. `avgEntry` — средневзвешенная по **всем** входам трейда (те же веса `volume`).
2. `gross = (exit.price − avgEntry) × exit.volume`; для **SHORT**: `gross = −gross`
3. `pnl = gross − exit.fee − exit.funding` (fee/funding ноги)
4. **ROI этой ноги (в процентах):**  
   `notional = exit.price × exit.volume`, затем `roiPct = (pnl / notional) × 100` при `notional > 0`, иначе `0`.

Используется на странице «Закрытые» во вкладке «Сделки (выходы)».

---

## ROI закрытого трейда (таблица «Трейды»)

На странице закрытых для строки трейда:

- `notional = Σ (entry.price × entry.volume)` — «стоимость входа» в котировке
- `pnl = calculateTradePnL(t)`
- `roi = (pnl / notional) × 100` при `notional > 0`, иначе `0`

---

## Баланс и ROI портфеля (дашборд)

Константа стартового депозита для оценки: `INITIAL_DEPOSIT = 1000` (USDT), см. `app/dashboard/page.tsx`.

- `totalPnL = Σ calculateTradePnL(t)` по всем трейдам со статусом **CLOSED**
- `balance = INITIAL_DEPOSIT + totalPnL`
- `roi = (totalPnL / INITIAL_DEPOSIT) × 100`

Кривая equity в `EquityChart.tsx` наращивает баланс по мере закрытия трейдов в хронологическом порядке (`closedAt`).

---

## Риск на сделку (модуль риска)

`calculateRiskForTrade(entries, stopLossPrice, settings)`:

- `totalVolume = Σ entry.volume`
- `avgEntryPrice = Σ (price × volume) / totalVolume`
- `riskAmount = |avgEntryPrice − stopLossPrice| × totalVolume`
- `riskPercent = (riskAmount / settings.accountBalance) × 100`

Предупреждения сравнивают `riskPercent` с `settings.riskPerTrade` и `riskAmount` с 10% баланса.

---

## Номинал и комиссия (подсказка в форме)

`src/lib/bingx-fees.ts`:

- **Номинал:** `notionalUsdt(price, volume) = price × volume` (линейный контракт, USDT-номинал для подсказки).
- **Комиссия от bps:** `feeUsdtFromBps(notional, role, makerBps, takerBps) = notional × (bps / 10_000)`, где `bps` зависит от Maker/Taker.

Это **оценка** для поля комиссии при создании сделки, не замена учёта фактических `fee`/`funding` в PnL.

---

## Git и документация

Папка `docs/` **не** перечислена в `.gitignore`. Если изменения в `.md` не попадают в репозиторий, их нужно явно добавить и закоммитить: `git add docs/ …` и `git commit`.

При изменении формул в коде **обновляйте этот файл** в том же коммите или сразу следом.
