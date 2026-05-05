# Дневник трейдера — полный роадмап (v2)

Дата редакции: 2026-05-05  
Статус: актуальный (этап **2.3** в таблице ниже — выполнен)

---

## Обзор этапов

| Этап | Название | Зависит от |
|------|----------|------------|
| 1 | Стабилизация фундамента ✅ | — |
| 2 | Домен сделок / Журнал | 1 |
| 2.3 ✅ | Архитектура: слои API, envelope, DTO, data flow | 2 |
| 2.5 | App shell + справочники + Account | 2.3 |
| 2.6 | Дашборд: PnL за день + усреднение | 2.5, 4, 4.5 |
| 3 | Аналитика и визуализация | 2.5 |
| 3.5 | Портфель и кэшфлоу | 2.5 |
| 4 | Риск-менеджмент + push-уведомления | 2.5 |
| 4.5 | Прогноз и цель дня | 3.5, 4 |
| 5 | Импорт/экспорт + BingX (ручной + авто sync) | 2.5 |
| 6 | Продакшн-готовность | все |
| 7 | Технические улучшения (PWA + OpenAPI) | 6 |

### Схема зависимостей

```
1 (фундамент)
└── 2 (сделки + теги + чеклист)
    └── 2.3 ✅ (слои backend, envelope API, DTO, фронт data flow)
        └── 2.5 (app shell + Account + справочники)
            ├── 3 (аналитика, equity-заглушка)
            │   └── 3.5 (кэшфлоу → equity реальная)
            │       └── 4.5 (прогноз)
            │           └── 2.6 (дашборд виджеты) ← также зависит от 4
            ├── 4 (риск + push + position sizing)
            │   └── 2.6
            └── 5 (xlsx + BingX ручной + авто sync)
                └── 6 (прод)
                    └── 7 (PWA + OpenAPI)
```

> **Этап 2.3** ✅ закрыт (детали — `docs/02_3-stage-architecture-and-api-consistency.md`). Далее по плану — **2.5**.  
> **Параллельно после 2.5** можно вести: 3, 4, 5. Этапы 3.5 и 4.5 идут последовательно после 3 и 4.

---

## Этап 1 — Стабилизация фундамента ✅

Статус: выполнен.

**Что сделано:**
- Единый App Router root `app/`, алиасы `@/*` → `./src/*`
- Один `next.config.*`, чистый `.gitignore`
- Prisma-схема: `Trade + Entry + Exit`, поля согласованы с API
- NextAuth credentials + JWT + middleware-защита всех роутов
- Все запросы изолированы по `userId`
- Seed для single-user (без публичной регистрации)
- README с env, командами Prisma, схемой запуска

---

## Этап 2 — Домен сделок / Журнал

**Цель:** правильная доменная модель и журнал сделок как основная ценность приложения.

### Definition of Done

- Пользователь создаёт открытую сделку (Trade) с первым Entry
- Поддержаны несколько входов и выходов в рамках одного Trade
- Закрытие Trade фиксирует `closedAt` и `status = CLOSED`
- При открытии: стратегия, теги, эмоции входа, чеклист (опционально)
- При закрытии: цена, объём, эмоции выхода, комиссия, фандинг
- Журнал с группировкой по дням/неделям/месяцам
- Быстрые фильтры: монета, стратегия, тег, статус, рынок
- Все CRUD защищены и работают только с `userId`

### Ключевые решения

**Комиссии:** хранятся на уровне `Exit`, агрегируются в `Trade.fee` и `Trade.funding` при каждом изменении. Это обеспечивает точность аналитики.

**Временные зоны:** все `timestamp` хранятся в UTC. Отображение — в локальной зоне браузера через `Intl.DateTimeFormat`. Время Entry/Exit проставляется сервером автоматически.

**Маржа vs объём:** поле называется `margin` (маржа в USDT). В UI везде писать "Маржа". Объём контракта = `margin × leverage`.

### Модель данных

```prisma
model Trade {
  id           String      @id @default(cuid())
  userId       String
  accountId    String
  symbol       String
  marketType   MarketType  // SPOT | FUTURE
  direction    Direction   // LONG | SHORT
  status       TradeStatus // OPEN | CLOSED
  strategy     String?     // FK → Strategy.name (denorm для простоты)
  emotionEntry String?
  emotionExit  String?
  notes        String?
  fee          Float       @default(0)  // агрегат из Exit[]
  funding      Float       @default(0)  // агрегат из Exit[]
  createdAt    DateTime    @default(now())
  closedAt     DateTime?
  entries      Entry[]
  exits        Exit[]
  tags         Tag[]
  @@index([userId, status])
  @@index([userId, closedAt])
}

model Entry {
  id            String   @id @default(cuid())
  tradeId       String
  trade         Trade    @relation(...)
  timestamp     DateTime @default(now())
  price         Float
  margin        Float    // маржа в USDT
  leverage      Int      @default(1)
  stopLossPrice Float?   // обязателен для FUTURE (валидация на уровне API)
  reason        String?
}

model Exit {
  id        String   @id @default(cuid())
  tradeId   String
  trade     Trade    @relation(...)
  timestamp DateTime @default(now())
  price     Float
  margin    Float    // маржа выхода в USDT
  fee       Float    @default(0)
  funding   Float    @default(0)
}

model Tag {
  id     String  @id @default(cuid())
  userId String
  name   String
  color  String?
  trades Trade[]
  @@unique([userId, name])
}

model ChecklistItem {
  id       String  @id @default(cuid())
  userId   String
  text     String
  position Int
  active   Boolean @default(true)
  @@index([userId])
}
```

### Чеклист перед сделкой

- Настраивается в Settings: добавление/удаление/переупорядочивание пунктов
- При открытии сделки — модальное окно с чеклистом (если есть активные пункты)
- Галочки не сохраняются в БД — только дисциплинирующий инструмент
- Нет активных пунктов → окно не показывается

### Расчёты (модуль `src/lib/calc.ts`)

```ts
// Средняя цена входа (взвешенная по марже)
avgEntry = Σ(entry.price × entry.margin) / Σ(entry.margin)

// Объём контракта (в единицах базовой монеты)
contractVolume = (margin × leverage) / price

// PnL для LONG:  (avgExit - avgEntry) / avgEntry × totalMargin × leverage
// PnL для SHORT: (avgEntry - avgExit) / avgEntry × totalMargin × leverage
// Итоговый PnL = rawPnL - fee - funding

// ROI% = PnL / Σ(entry.margin) × 100
```

### API

```
POST   /api/trades                    создать Trade + первый Entry
POST   /api/trades/:id/entries        добавить Entry
POST   /api/trades/:id/exits          добавить Exit (пересчёт fee/funding на Trade)
POST   /api/trades/:id/close          закрыть Trade
GET    /api/trades                    список с фильтрами (?status=&symbol=&tag=&strategy=&from=&to=)
DELETE /api/trades/:id                удалить Trade целиком
```

### Тест-план

- Создание Trade + Entry → добавление частичного Exit → проверка PnL
- Закрытие Trade → появление в разделе "Закрытые"
- Фильтрация по дате, символу, тегу, стратегии
- Чеклист: настроить пункты → появляется при открытии / не появляется если пустой

---

## Этап 2.3 — Архитектура приложения: слои, API-контракты, data flow ✅

**Статус:** выполнен (2026-05-05).

**Цель:** убрать технический долг до масштабирования продукта: единый envelope API, разделение `route → service → repository`, DTO вместо Prisma-типов в UI, сервер как источник истины для отображаемых агрегатов (PnL/ROI/equity), декомпозиция «бог-страниц», единый клиентский слой загрузки данных.

**Зависимости:** этап 2 (рабочие сделки и API).

**Итог и чек-лист:** [`02_3-stage-architecture-and-api-consistency.md`](./02_3-stage-architecture-and-api-consistency.md).

**Связь с этапом 2.5:** справочники, `Account` и расширенный shell строятся поверх предсказуемых контрактов и структуры фронта (блокер 2.3 снят).

---

## Этап 2.5 — App shell + справочники + Account

**Цель:** структура приложения "как продукт": навигация, справочники, мульти-аккаунты.

### Definition of Done

- Единый layout: desktop sidebar + mobile bottom bar
- Все вкладки — отдельные защищённые routes
- Settings: CRUD стратегий, эмоций, тегов, чеклист-пунктов, аккаунтов
- Модель `Account` в схеме (мульти-биржа с первого дня)
- Открытые и закрытые сделки разнесены по страницам

### Навигация

| Путь | Название |
|------|----------|
| `/trades/open` | Открытые сделки |
| `/trades/closed` | Закрытые сделки |
| `/portfolio` | Портфель |
| `/analytics` | Аналитика |
| `/risk` | Риск |
| `/forecast` | Прогноз |
| `/settings` | Настройки |

### Модель Account

```prisma
model Account {
  id           String     @id @default(cuid())
  userId       String
  name         String     // "BingX Main", "Bybit Sub"
  exchange     String?    // "bingx", "bybit", "binance", ...
  baseCurrency String     @default("USDT")
  apiKeyEnc    String?    // зашифрованный ключ (этап 5)
  apiSecretEnc String?
  lastSyncAt   DateTime?  // последний успешный sync (этап 5)
  createdAt    DateTime   @default(now())
  trades       Trade[]
  cashflows    Cashflow[]
  @@index([userId])
}
```

> Один аккаунт = одна биржа. Архитектура позволяет добавлять любые биржи в будущем без миграций схемы.

### Справочники в Settings

- **Стратегии** — название, описание, цвет: CRUD
- **Эмоции** — фиксированный список + возможность добавить свои: CRUD
- **Теги** — название, цвет: CRUD
- **Чеклист** — список пунктов с drag-and-drop, toggle active/inactive
- **Аккаунты** — название, биржа, валюта: CRUD (API-ключи в этапе 5)

---

## Этап 2.6 — Дашборд: PnL за день + усреднение

**Цель:** мгновенная картина дневной эффективности и инструмент безопасного усреднения позиции.

### Definition of Done

- На дашборде отображаются PnL $ и ROI % за день с цветовой индикацией
- Сравнение с целью дня (из этапа 4.5): "достигнуто X% от цели"
- PnL за день в фиатной валюте (USD/EUR, настраивается в Settings)
- Блок "Усреднение" для каждой OPEN позиции

### 1. PnL / ROI за день

**Расчёт:**
```
pnlDay     = Σ PnL по closedAt == сегодня − комиссии − funding
roiDay     = pnlDay / balanceAtStartOfDay × 100%
balanceAtStartOfDay = Σ cashflow до начала дня + cumulativePnL до начала дня
```

**Отображение:**
- Крупная карточка, зелёный/красный цвет
- Прогресс-бар относительно цели дня: "70% от цели дня"
- Конвертация в фиат: `pnlFiat = pnlUsdt × fxRate` (курс из BingX API или ручной)

### 2. Блок "Усреднение"

Требует текущую цену монеты. **Источник котировок:** BingX API (через подключённый аккаунт). Если аккаунт не подключён — блок показывает заглушку "Подключите BingX для получения цен".

Polling текущей цены: каждые 30 секунд через `GET /api/prices?symbol=BTCUSDT` → прокси к BingX ticker API. Кешируется на сервере 15 сек.

**Для каждой OPEN сделки:**

```
avgEntry        = взвешенная средняя цена всех Entry
currentPrice    = из BingX API
safeZonePercent = (riskPerTrade% / 2) / leverage

// Безопасный диапазон усреднения
safeZoneLow  = avgEntry × (1 - safeZonePercent)  // для LONG
safeZoneHigh = avgEntry × (1 + safeZonePercent)  // для SHORT

// Максимальный откат от входа
maxDrawdownPct = (minPrice24h - avgEntry) / avgEntry × 100  // для LONG

// Динамика за час
momentum1h = (currentPrice - price1hAgo) / price1hAgo × 100

// Можно добавить маржи
usedRisk$       = |avgEntry - stopLoss| × contractVolume
remainingRisk$  = (riskPerTrade% × accountBalance / 100) - usedRisk$
safeAddMargin   = remainingRisk$ / |avgEntry - stopLoss| × avgEntry / leverage
```

**UI блока:**
- Таблица по каждой открытой позиции
- Колонки: символ, avg entry, текущая цена, безопасный диапазон, откат %, динамика 1h, можно добавить маржу $

### Зависимости

- Этап 2 (Trade/Entry данные)
- Этап 4 (RiskSettings — лимиты риска)
- Этап 4.5 (цель дня для прогресс-бара)
- Этап 5 (BingX API — котировки)

> **Примечание по порядку реализации:** этап 2.6 реализуется последним среди своей группы, так как зависит от 4 и 4.5. Котировки из BingX появляются после этапа 5, до этого блок усреднения показывает статичные расчёты без динамики.

### Тест-план

- PnL за день совпадает с суммой закрытых за сегодня сделок
- Цель дня из прогноза отображается и обновляется при изменении
- Безопасный диапазон усреднения не выходит за лимиты риска
- При отключённом BingX — корректная заглушка

---

## Этап 3 — Аналитика и визуализация

**Цель:** корректная аналитика по закрытым сделкам, графики для улучшения торговли.

### Definition of Done

- Основные метрики по выбранному периоду: PnL, PnL%, Winrate, Avg win/loss, Profit factor, R/R
- Дополнительные метрики (этап 7): Sharpe Ratio, Max Drawdown, Expectancy, Recovery Factor, Avg Holding Time
- Срезы: монета, стратегия, тег, эмоция входа/выхода, время суток, дни/недели/месяцы
- Графики: Equity curve, PnL по времени, статистика по стратегиям, распределение PnL
- Единая панель фильтров влияет на все метрики и графики

### База для % доходности

```
balanceAtPeriodStart =
  Σ(DEPOSIT до periodStart) − Σ(WITHDRAWAL до periodStart)
  + cumulativePnL(всех закрытых сделок до periodStart)

roiPeriod = pnlPeriod / balanceAtPeriodStart × 100%
```

До реализации этапа 3.5 — использовать `RiskSettings.accountBalance` как константу.

### Equity curve

- **До этапа 3.5:** x = дата закрытия, y = кумулятивный PnL от первой сделки
- **После этапа 3.5:** y = `balanceAtStart + cumulativePnL + Δcashflow`

### Метрики

```
winrate         = count(pnl > 0) / count(closed) × 100%
avgWin          = mean(pnl | pnl > 0)
avgLoss         = mean(pnl | pnl < 0)
profitFactor    = Σ(wins) / abs(Σ(losses))
riskReward      = avgWin / abs(avgLoss)

// Этап 7:
maxDrawdown     = max(peakBalance - valleyBalance) / peakBalance × 100%
expectancy      = avgWin × winrate/100 − abs(avgLoss) × (1 − winrate/100)
recoveryFactor  = totalPnL / abs(maxDrawdown$)
sharpe          = (meanDailyReturn − riskFreeRate) / stdDailyReturn
avgHoldingTime  = mean(closedAt − createdAt) по закрытым сделкам
```

### Max PnL/ROI по периодам

- За день / месяц / год / всё время
- Максимум на одну сделку
- ROI по отношению к марже открытой позиции (не к депозиту)

### API аналитики

```
GET /api/analytics/summary?from=&to=&accountId=&strategy=&tag=
GET /api/analytics/equity?from=&to=&accountId=
GET /api/analytics/breakdown?by=strategy|tag|symbol|emotion&from=&to=
GET /api/analytics/maxpnl?period=day|month|year|all
```

Все агрегаты считаются на сервере. Prisma-запросы с `include: { entries, exits }` только в нужном диапазоне.

### Тест-план

- PnL из журнала = PnL из аналитики за тот же период
- Фильтр по тегу/стратегии — корректная выборка
- Equity curve пересчитывается после появления cashflow данных

---

## Этап 3.5 — Портфель и кэшфлоу

**Цель:** учёт пополнений/выводов, корректная equity curve от реального депозита.

### Definition of Done

- Страница `/portfolio` с таблицей операций и фильтрами по периоду
- CRUD cashflow-операций: пополнение, вывод
- Equity curve в аналитике пересчитывается с учётом cashflow
- Итог по периоду: net inflow, расчётный баланс

### Модель

```prisma
model Cashflow {
  id        String       @id @default(cuid())
  userId    String
  accountId String
  account   Account      @relation(...)
  type      CashflowType // DEPOSIT | WITHDRAWAL
  amount    Float
  currency  String       @default("USDT")
  fxRate    Float?       // курс на момент операции, если не USDT
  fee       Float?
  timestamp DateTime
  note      String?
  @@index([userId, accountId, timestamp])
}
```

### Расчёт баланса

```
balanceAt(date, accountId) =
  Σ(Cashflow.amount WHERE type=DEPOSIT AND timestamp ≤ date AND accountId)
  − Σ(Cashflow.amount WHERE type=WITHDRAWAL AND timestamp ≤ date AND accountId)
  + Σ(Trade.pnl WHERE closedAt ≤ date AND accountId)
```

Мульти-валюта: `fxRate` фиксируется на момент операции. Приведение к USDT: `amountUsdt = amount × fxRate`.

---

## Этап 4 — Риск-менеджмент + push-уведомления

**Цель:** расчёт риска для открытых позиций, правила, подсветка нарушений, push в браузере.

### Definition of Done

- Настройки риска: депозит, риск на сделку%, риск на день%, макс. просадка%, риск на все OPEN%
- Для каждой OPEN сделки: риск $ и % с бейджем OK/High
- **Margin Ratio** — уровень близости к ликвидации (точный из BingX API или приближённый)
- Dashboard: open risk total, risk used today, Margin Ratio индикатор
- Position sizing calculator с предварительным расчётом Margin Ratio
- Push-уведомления в браузере при нарушении правил

### Модель

```prisma
model RiskSettings {
  id             String   @id @default(cuid())
  userId         String   @unique
  accountBalance Float
  riskPerTrade   Float    // % от баланса
  riskPerDay     Float
  maxDrawdown    Float
  maxOpenRisk    Float
  updatedAt      DateTime @updatedAt
}
```

`stopLossPrice` хранится в `Entry` — обязателен для FUTURE (валидация на уровне API), опционален для SPOT.

### Два вида риска (разные смыслы, оба нужны)

| Метрика | Смысл | Источник |
|---------|-------|---------|
| **Risk per trade %** | Сколько депозита теряешь если цена дойдёт до стоп-лосса | Считаем сами по Entry/стопу |
| **Margin Ratio %** | Насколько близко к ликвидации (как на BingX) | Подтягиваем из BingX API или считаем приближённо |

### Расчёт риска на сделку (Risk per trade)

```
avgEntry    = взвешенная средняя по Entry
openMargin  = Σ(entry.margin) − Σ(exit.margin)  // оставшаяся маржа
contractVol = openMargin × leverage / avgEntry

risk$  = |avgEntry − stopLossPrice| × contractVol
risk%  = risk$ / accountBalance × 100
```

### Margin Ratio (уровень близости к ликвидации, формула BingX)

**Точная формула (из BingX документации):**
```
Margin Ratio % =
  (Σ maintenanceMargin по всем cross-позициям + Σ closingFee по всем cross-позициям)
  /
  (accountBalance − Σ margin по isolated-позициям − lockedAssets + Σ unrealizedPnL по cross-позициям)
  × 100%
```

- Чем выше Margin Ratio → тем ближе к маржин-коллу
- При Margin Ratio ≥ 100% → принудительная ликвидация

**Способ A — подтягивать из BingX API** (точно, если аккаунт подключён):
```
GET /openapi/contract/v1/balance       → accountBalance, unrealizedPnL, lockedAssets
GET /openapi/contract/v1/allPosition   → maintenanceMargin, margin по каждой позиции
→ считаем Margin Ratio на сервере, кешируем 15 сек
```

**Способ B — приближённый расчёт** (если BingX не подключён):
```
maintenanceMarginRate ≈ 0.5%–2.5% в зависимости от размера позиции (тир)
maintenanceMargin     ≈ contractValue × maintenanceMarginRate
Margin Ratio          ≈ Σ(maintenanceMargin) / (accountBalance + Σ unrealizedPnL) × 100%
```

**Отображение:**
- Индикатор Margin Ratio в виде прогресс-бара на дашборде и в блоке каждой позиции
- Зелёный < 50%, жёлтый 50–80%, красный > 80%
- Если данные из BingX — показываем точное значение; если приближённо — помечаем "~"

### Position sizing calculator

Встроен в форму открытия сделки и на странице `/risk`.

**Входные параметры:**
- Депозит (из RiskSettings или текущий баланс)
- Риск на сделку %
- Цена входа
- Цена стоп-лосса
- Плечо

**Выходные данные:**
```
risk$          = accountBalance × riskPerTrade / 100
stopDistance%  = |entryPrice − stopLossPrice| / entryPrice × 100
contractVol    = risk$ / (stopDistance% / 100 × entryPrice)
margin         = contractVol × entryPrice / leverage
```

UI показывает: рекомендуемую маржу в USDT, объём контракта, плечо, риск $, ожидаемый Margin Ratio после открытия.

### Правила (warnings)

```
risk% > riskPerTrade              → бейдж "Risk High" на строке + push
Σ(risk% всех OPEN) > maxOpenRisk  → предупреждение на дашборде + push
dailyLoss > riskPerDay            → предупреждение + push
```

`dailyLoss` = убытки по CLOSED за сегодня + unrealized loss по OPEN (если есть текущие цены).

### Push-уведомления (Web Push API)

```prisma
model PushSubscription {
  id       String @id @default(cuid())
  userId   String @unique
  endpoint String
  p256dh   String
  auth     String
}
```

**Механизм:**
1. Пользователь разрешает уведомления в Settings
2. Браузер создаёт PushSubscription → сохраняется в БД
3. При нарушении правил (на уровне API handler) → `web-push` отправляет push
4. Пуш отправляется максимум раз в 5 минут по одному типу нарушения (rate limit)

**Зависимости:** `npm install web-push`  
**Переменные:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

**Триггеры push:**
- Добавлен Entry/Exit → `risk% > riskPerTrade` или `Σopen > maxOpenRisk`
- Закрыта сделка с убытком → `dailyLoss > riskPerDay`
- Margin Ratio > 80% → предупреждение о приближении к ликвидации
- Margin Ratio > 95% → критическое предупреждение

### Тест-план

- OPEN trade со stopLoss, превышающим лимит → бейдж + push
- Position sizing calculator: изменить плечо → пересчёт маржи и Margin Ratio
- Изменить RiskSettings → пересчёт предупреждений
- Разрешить уведомления → получить тестовый push
- BingX подключён → Margin Ratio совпадает с показателем на бирже
- BingX не подключён → приближённый Margin Ratio помечается "~"
- Margin Ratio > 80% → предупреждение + push

---

## Этап 4.5 — Прогноз и цель дня

**Цель:** инструмент планирования — установка цели по депозиту и цели на день, моделирование сделок со сложным процентом.

### Definition of Done

- Вкладка `/forecast` в основной навигации
- Переключатель "План / Онлайн"
- Задать: цель по депозиту $, цель ROI на сделку %, дату достижения
- Таблица симуляции со сложным процентом
- Цель дня отображается на дашборде (этап 2.6)
- При достижении цели: сводка с опережением

### Режимы

**План** — чистая симуляция, не связана с реальными сделками.

**Онлайн** — факт + прогноз:
- Закрытые сделки отображаются строками с реальными данными
- После последней закрытой — планируемые строки от текущего депозита
- При закрытии новой сделки таблица обновляется автоматически

### Расчёт симуляции

```
// Входные параметры
currentBalance  // из Portfolio / RiskSettings
targetBalance   // цель $
roiPerTrade%    // slider 0.5% — 100%
targetDate      // дата достижения

// Симуляция (сложный процент)
rows = []
balance = currentBalance
while balance < targetBalance:
  pnl = balance × roiPerTrade / 100
  rows.push({ before: balance, pnl, after: balance + pnl })
  balance += pnl
```

### Модель данных

```prisma
model ForecastSettings {
  id             String   @id @default(cuid())
  userId         String   @unique
  targetBalance  Float
  roiPerTrade    Float    // %
  targetDate     DateTime
  dailyGoalPnl   Float?   // цель дня $, отображается в 2.6
  dailyGoalRoi   Float?   // цель дня %
  updatedAt      DateTime @updatedAt
}
```

### Таблица

**Режим план:**

| Депо (до) | PnL за сделку | Депо итог |
|-----------|---------------|-----------|
| 10,000 | +$100 (1%) | 10,100 |
| 10,100 | +$101 (1%) | 10,201 |

**Режим онлайн:**

| Депо (до) | PnL за сделку | Депо итог | ROI факт | Плечо | Тип |
|-----------|---------------|-----------|----------|-------|-----|
| 10,000 | +$95 | 10,095 | 0.95% | 10× | закрытая |
| 10,095 | +$150 | 10,245 | 1.49% | 5× | закрытая |
| 10,245 | +$512 (5%) | 10,757 | — | — | планируется |

Депо (до) в онлайн-режиме учитывает cashflow между сделками: `balance = prevBalance + cashflowBetween + prevPnL`.

### Цветовая индикация

| Цвет | Условие |
|------|---------|
| Зелёный | Закрытая сделка, PnL > 0 |
| Красный | Закрытая сделка, PnL < 0 |
| Золотой яркий | Строка достижения цели по депозиту |
| Золотой тусклый | Строка цели дня |

Приоритет: яркий золотой > тусклый золотой > зелёный/красный.

### После достижения цели

- Сводка вверху: "Цель $10,200 достигнута на 7 дней раньше срока, опережение +$150"
- Таблица продолжается на 10 строк вперёд от текущего депозита
- Кнопка "Скрыть закрытые" — показывает только планируемые строки
- Клик по строке онлайн-режима → переход в "Закрытые сделки" с открытой карточкой

### Тест-план

- Переключение "План / Онлайн" — таблица перестраивается
- После закрытия сделки — строка добавляется, планируемые пересчитываются
- Расчёт сложного процента при разных % (проверить математику)
- Цель дня появляется на дашборде (2.6) после сохранения
- Cashflow между сделками корректно влияет на "Депо (до)"
- Досрочное достижение → сводка с опережением

---

## Этап 5 — Импорт/экспорт + BingX

**Цель:** переносимость данных, ручной и автоматический импорт с биржи.

### Definition of Done

- Экспорт всех сделок в `.xlsx`
- Импорт из `.xlsx` с валидацией и preview
- BingX ручной sync: кнопка "Sync" → импорт позиций
- BingX авто sync: polling открытых позиций, автоматическое открытие/закрытие сделок
- API-ключи хранятся зашифрованно в БД

### Экспорт `.xlsx`

**Листы:**
- `Trades`: id, symbol, marketType, direction, accountId, strategy, tags, emotionEntry, emotionExit, notes, fee, funding, pnl, roi, createdAt, closedAt
- `Entries`: tradeId, timestamp, price, margin, leverage, stopLossPrice, reason
- `Exits`: tradeId, timestamp, price, margin, fee, funding

Форматы: даты → Excel date type, числа → number, UTC в файле.

### Импорт `.xlsx`

1. Загрузка файла
2. Парсинг + zod-валидация каждой строки
3. Preview: сколько будет создано / пропущено / с ошибками
4. Пользователь подтверждает
5. Транзакция в БД (всё или ничего)

Дедупликация по `externalId` (если есть) или по `(symbol, direction, createdAt, accountId)`.

### Хранение API-ключей

```ts
// src/lib/crypto.ts
const ALGO = { name: "AES-GCM", iv: crypto.getRandomValues(new Uint8Array(12)) };
const key  = await crypto.subtle.importKey("raw", hexToBuffer(process.env.ENCRYPTION_KEY!), ALGO, false, ["encrypt", "decrypt"]);

export const encrypt = async (text: string) => { /* возвращает iv:ciphertext в base64 */ };
export const decrypt = async (encrypted: string) => { /* расшифровка */ };
```

`ENCRYPTION_KEY` — 32 байта hex в env. Никогда не хранится в БД. Ключи бирж хранятся в `Account.apiKeyEnc`, `Account.apiSecretEnc`.

### BingX ручной sync

- Кнопка "Sync" в Settings → Интеграции
- Запрос к BingX API: история позиций за последние N дней
- Маппинг: `positionId` или `(symbol + direction + 24h окно)` → Trade
- Каждый fill сохраняется с `externalId = fill.orderId` — upsert при повторном sync
- Лог: последний sync, добавлено/пропущено записей

### BingX авто sync (онлайн-режим)

**Механизм: polling (каждые 60 сек)**

```
Cron / setInterval на сервере:
1. GET BingX /openapi/contract/v1/allPosition → открытые позиции
2. Сравнить с OPEN трейдами в БД по externalId
3. Новые позиции → создать Trade + Entry (status=OPEN)
4. Закрытые позиции → добавить Exit, закрыть Trade (status=CLOSED)
5. Изменившиеся Entry → обновить margin/price
```

**Что пользователь добавляет вручную** (после авто-импорта):
- Стратегия, теги, эмоции входа
- Эмоции выхода, заметки (постфактум после закрытия)
- stopLossPrice (или берётся из BingX если выставлен)

**Реализация polling в Next.js:**
- Route `/api/sync/bingx` — вызывается cron-задачей (Vercel Cron / Railway cron) раз в минуту
- Или: `setInterval` в `instrumentation.ts` (Next.js 14+) для Railway деплоя

**Переменные:**
```
ENCRYPTION_KEY=<32-byte hex>
CRON_SECRET=<random>   # для защиты /api/sync/bingx от внешних вызовов
```

### Маппинг BingX → модель

```
BingX position    → Trade (symbol, direction, leverage)
BingX fill (open) → Entry (price, margin, timestamp, externalId)
BingX fill (close)→ Exit (price, margin, fee, funding, timestamp)
BingX stopLoss    → Entry.stopLossPrice (если выставлен)
```

### Тест-план

- Экспорт → импорт в пустую БД → метрики совпадают
- Импорт с ошибками → корректный отчёт, нет частичных записей
- Ручной sync повторно → дубликаты не создаются (idempotent)
- Авто sync: открыть позицию на BingX → через 60 сек появляется в Open trades
- Авто sync: закрыть позицию на BingX → через 60 сек появляется в Closed trades

---

## Этап 6 — Продакшн-готовность

**Цель:** приложение работает через интернет надёжно, безопасно и восстанавливаемо.

### Definition of Done

- Выбрана платформа деплоя, переменные настроены
- Миграции выполняются безопасно
- Бэкапы БД включены и протестированы
- Health-check, логирование ошибок
- CI/CD: lint + build + prisma validate

### Платформа

**Railway** (рекомендуется) — app + PostgreSQL, автодеплой из GitHub, встроенные бэкапы, cron для sync.  
Альтернатива: Vercel + Neon/Supabase (Postgres).

> Для авто sync BingX (этап 5) Railway предпочтительнее — Vercel cron работает только на Pro плане.

### Безопасность

- `NEXTAUTH_SECRET` — случайный, ротируется только при компрометации (инвалидирует сессии)
- `NEXTAUTH_URL` — production domain с HTTPS
- Cookies: `secure: true`, `sameSite: "lax"`
- Rate-limit: max 10 попыток/мин на `/api/auth/callback/credentials`
- Заголовки: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, базовый CSP
- `ENCRYPTION_KEY` и `VAPID_PRIVATE_KEY` — только в env, не в логах

### Prisma индексы (проверить что все есть)

```prisma
Trade:    @@index([userId, status])
          @@index([userId, closedAt])
          @@index([userId, createdAt])
Cashflow: @@index([userId, accountId, timestamp])
Entry:    @@index([tradeId])
Exit:     @@index([tradeId])
```

### CI/CD

```yaml
# .github/workflows/ci.yml
steps:
  - run: npm run lint
  - run: npm run build
  - run: npx prisma validate
# Автодеплой на main через Railway/Vercel GitHub integration
```

### Runbook

**Deploy:** push в `main` → автодеплой. Если есть миграция: `npx prisma migrate deploy` до деплоя.

**DB backup (Railway):** автоматически в плане. Ручной: `pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql`. Тест restore раз в месяц в dev.

**Ротация секретов:**
- `NEXTAUTH_SECRET` → все сессии инвалидируются, пользователь перелогинивается
- `ENCRYPTION_KEY` → нужен migration script для перешифровки API-ключей в БД
- `VAPID_*` → пользователь должен заново разрешить уведомления в браузере
- `CRON_SECRET` → обновить в Railway cron настройках

---

## Этап 7 — Технические улучшения (PWA + OpenAPI)

**Цель:** повысить качество разработки и UX — установка на устройство, офлайн-режим, документированный API.

### Definition of Done

- Приложение работает как PWA (установка на iOS/Android)
- Офлайн-режим: просмотр журнала без интернета (кешированные данные)
- API документирован (OpenAPI/Swagger) на `/api-docs`
- Zod-схемы вынесены в `src/shared/schemas/` и используются везде (API + клиент)
- Кэширование справочников (стратегии, теги, эмоции)

### PWA

```
public/manifest.json     — name, theme_color, icons, start_url
public/sw.js             — Service Worker (Workbox)
```

**Стратегии кеширования:**
- Статика (JS/CSS) — Cache First
- Список сделок — Network First с fallback на кеш
- Справочники (стратегии, теги) — Stale While Revalidate

**Критерии:** Lighthouse PWA ≥ 90, установка на Android (Chrome) и iOS (Safari).

### OpenAPI / Swagger

Генерация из Zod-схем через `zod-to-openapi`:
- `GET /api/openapi.json` — спецификация
- `GET /api-docs` — Swagger UI

### Zod-схемы (shared)

```
src/shared/schemas/
  trade.schema.ts      — TradeSchema, CreateTradeSchema
  entry.schema.ts      — EntrySchema, CreateEntrySchema
  exit.schema.ts       — ExitSchema, CreateExitSchema
  risk.schema.ts       — RiskSettingsSchema
  forecast.schema.ts   — ForecastSettingsSchema
  cashflow.schema.ts   — CashflowSchema
src/shared/types/      — типы, выведенные из схем через z.infer<>
```

### Кэширование справочников

```ts
// Next.js unstable_cache или SWR с staleTime: 1h
const getStrategies = unstable_cache(
  async (userId) => prisma.strategy.findMany({ where: { userId } }),
  ["strategies"],
  { revalidate: 3600, tags: ["strategies"] }
);
// Инвалидация при CRUD: revalidateTag("strategies")
```

### Тест-план

- Установить PWA на устройство → ярлык на рабочем столе
- Отключить сеть → журнал показывает кешированные данные
- `/api-docs` — все эндпоинты с описаниями
- Изменить стратегию → следующий запрос получает актуальные данные

---

## Полный список переменных окружения

```env
# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://...

# Push-уведомления (этап 4)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

# Шифрование API-ключей бирж (этап 5)
ENCRYPTION_KEY=   # 32 байта, hex

# Защита cron endpoint (этап 5)
CRON_SECRET=
```

---

## Что сознательно исключено

| Фича | Решение |
|------|---------|
| Скриншоты к сделкам | Не добавляем. Архитектура под Cloudflare R2 описана отдельно — при необходимости вставляется в этап 5 или 6 |
| Email-уведомления | Не нужны, только Web Push |
| Публичная регистрация | Single-user, seed-based |
| Мобильное приложение | PWA покрывает мобильный сценарий |
| Dark mode | Tailwind `dark:` классы — добавляется попутно в любом этапе, не требует отдельного этапа |
