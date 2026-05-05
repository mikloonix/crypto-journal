# Crypto Trading Journal — аудит текущего состояния

Дата обновления: 2026-05-05

## Контекст

Single-user веб‑приложение «Дневник трейдера»: журнал фьючерсных/спот сделок, аналитика, риск, портфель, импорт — по этапам в `docs/ROADMAP.md`.

## Позиция по этапам (сводка)

| Этап | Статус (по коду и докам) |
|------|---------------------------|
| **1** Фундамент | Выполнен: `app/`, auth, Prisma, `userId` в API |
| **2** Домен сделок / журнал | **Выполнен по прикладному DoD** (журнал, фильтры API + UI, группировки, мобильные карточки, колонки журнала). Отдельные REST `POST .../entries|exits` из примера в доке **не обязательны** — используются `POST /api/trades` и `POST /api/trades/close`. Целевая модель A (`Account`, fee на Exit) — в `roadmap-full-v2.md`, не в текущей схеме Prisma. |
| **2.3** Архитектура / API / data flow | ✅ **Выполнен** — см. `02_3-stage-architecture-and-api-consistency.md`: envelope API, service/repository, DTO, журнал/агрегаты на сервере, `features/trades`, хуки сессии без дублирующего редиректа на `/login` для страниц из middleware |
| **2.5** App shell + справочники + Account | **Текущий приоритет**: навигация и маршруты есть; CRUD справочников, выбор `Account`, целевой layout из UI-гайда — **в основном не готовы** |
| **3+** | Заглушки маршрутов / по плану |

**Рабочая точка:** этап **2.5** (после закрытия 2 и 2.3).

## Стек (фактически)

- Next.js App Router, React 18, Tailwind, Radix, Recharts, Prisma + PostgreSQL, NextAuth (credentials + JWT).

## Устаревшие фрагменты старого аудита (2026-05-02)

Ниже описанные проблемы **сняты или частично сняты** — оставлено для истории:

| Было | Сейчас |
|------|--------|
| Дубли `app/` vs `src/app/` | Единый UI/API в **`app/`**; `src/` — lib и компоненты |
| API не по схеме Prisma | `Trade` + `Entry`/`Exit`, хендлеры согласованы |
| Нет `userId` в API | Запросы с `session.user.id` |
| Два `next.config` | Один конфиг |
| README по умолчанию | Проектный README (см. репозиторий) |

## Актуально в коде (MVP)

- **Auth:** `middleware.ts` защищает страницы из matcher; на клиенте для этих маршрутов нет повторного `router.push("/login")` при `unauthenticated` (редирект только при **401** от API через `redirectOn401`).
- **API журнала и настроек:** ответы в формате `{ success, data?, error? }`; доменная логика в `src/server/services` + Prisma в `src/server/repositories`.
- **Журнал (UI):** типы из `src/contracts/trades.ts`; PnL/ROI/equity для карточек и таблиц приходят с сервера (`journal`, `summary` в `GET /api/trades`).
- **Сделки:** объединение входов в один OPEN `Trade` по symbol+direction+marketType; частичное закрытие через `Exit`; корзина и восстановление.
- **Дашборд** (`/dashboard`): форма вынесена в `TradeOpenForm`, таблица — `OpenTradesTable`, карточки — `DashboardSummaryCards`; данные через `useTradesJournal`.
- **Настройки** (`/settings`): `getTradingDefaults` / `patchTradingDefaults` через `features/trades/api`.
- **Закрытые** (`/trades/closed`): `GET /api/trades?...` с фильтрами; группировка и карточки на mobile; обновление при `visibilitychange`.
- **Заглушки маршрутов:** portfolio, analytics, risk (навигация в layout).

## Расхождения документация ↔ код (не баги, а дорожная карта)

| Документ / цель | Код сейчас |
|-----------------|------------|
| `roadmap-full-v2.md`: модель `Account`, `Trade.accountId` | В Prisma **нет** `Account`; сделки только по `userId`. |
| v2: `fee`/`funding` на `Exit`, маржа вместо `volume` | В Prisma **`volume`** на Entry/Exit; `fee`/`funding` на **Trade**; API close перезаписывает fee/funding на трейде. |
| v2: UTC, чеклисты, теги | Частично в roadmap, **не** в текущей схеме. |
| Этап 2.5: CRUD справочников стратегий/эмоций | Маршрут `/settings` — пока торговые параметры + корзина; справочники — в 2.5. |
| `UI-GUIDELINES.md`: токены `nansen-*`, sidebar | UI дашборда ещё на «сырых» gray-классах; гайд — целевой стандарт. |

Итог: **конфликт не внутри docs**, а между **целевой спекой v2** и **текущей упрощённой схемой**. В `docs/02-stage-trades-domain-and-journal.md` это отмечено как переход на модель A.

## Функциональные пробелы (кратко)

- Аналитика по скринам, портфель/cashflow, риск UI, BingX/xlsx, PWA/OpenAPI — по этапам ROADMAP.
- Динамическое **max leverage с биржи** — в UI пока константа **150** (`src/lib/trading-symbols.ts`).

## Как не потерять контекст при разработке

- Правила Cursor: `.cursor/rules/*.mdc`
- Субагенты: `.cursor/agents/*.md`
- Хук (опционально): `.cursor/hooks/shell-guard.mjs` — подключить через Project Hooks, см. предлагаемый `hooks.json` в ответе разработчика/в репозитории.
