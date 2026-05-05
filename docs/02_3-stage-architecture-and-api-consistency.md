# Этап 2.3 — Архитектура приложения: слои, API-контракты, data flow

**Статус:** ✅ **выполнен** (актуализация: 2026-05-05).  
**В roadmap:** между этапом **2** и этапом **2.5**.

**Цель:** устранить технический долг по слоям (route → service → repository), единому формату ответов API, связке UI ↔ сервер без дублирования финансовых расчётов и «бог-страниц», чтобы дальнейшие этапы (2.5+, аналитика, портфель) масштабировались без расползания кода.

**Зависимости:** этап **2** (рабочий домен сделок и API сделок). Схема Prisma в рамках этапа **не менялась**.

---

## Definition of Done — выполнение

| # | Критерий | Как закрыто |
|---|----------|-------------|
| 1 | Envelope API `{ success, data?, error? }` | `src/server/http/json-response.ts`; маршруты `app/api/trades/*`, `app/api/settings/trading` |
| 2 | `route → service → repository`, Prisma только в repository | `src/server/services/*`, `src/server/repositories/*` |
| 3 | PnL/ROI/equity для журнала с сервера | `src/server/trading/journal-metrics.ts` + поля `journal` / `legJournal` в DTO ответа `GET /api/trades` |
| 4 | UI без типов `@prisma/client` для отображения | `src/contracts/trades.ts`, страницы дашборда / закрытых / корзины / настроек |
| 5 | Единый клиентский слой | `src/lib/api-fetch.ts`, `src/features/trades/api.ts`; **React Query/SWR не внедрялись** (в DoD — опционально) |
| 6 | Декомпозиция дашборда | `features/trades/components/open-trades-table.tsx`, `trade-open-form.tsx`, `dashboard-summary-cards.tsx`; страница `app/dashboard/page.tsx` — композиция + мутации |
| 7 | Auth без дублирования редиректа на `/login` | `src/features/trades/hooks/use-protected-page-session.ts`: для маршрутов из `middleware.ts` matcher не вызывается `router.push("/login")` при `unauthenticated`; при **401 от API** — `src/features/trades/session-expired.ts` → `redirectOn401` |

---

## Ключевые файлы (ориентир)

```
src/contracts/              # ApiResponse, DTO сделок / настроек
src/lib/api-fetch.ts        # fetchEnvelope
src/server/http/json-response.ts
src/server/risk-defaults.ts
src/server/trading/         # journal-metrics, serialize-trade
src/server/repositories/   # trades, risk-settings, trash, exit
src/server/services/       # trades, trading-settings, trash
src/features/trades/
  api.ts
  session-expired.ts
  hooks/use-protected-page-session.ts
  hooks/use-trades-journal.ts
  components/              # форма, таблица, карточки
```

**Документация для агентов:** `AGENTS.md` — строка про envelope API.

---

## Порядок работ (фазы A–E) — статус

- **A** Контракты + envelope + клиент — ✅  
- **B** Service + repository — ✅  
- **C** Серверные агрегаты и `risk-manager` / `exit-leg-pnl` с сервера — ✅  
- **D** `features/trades/api`, hooks, декомпозиция UI — ✅  
- **E** Сборка `npm run build`; unit-тесты trading engine — в **этап 5.5** (`05_5-stage-testing.md`)

---

## Запреты (соблюдены)

- Новая доменная модель (`Account`, fee на Exit и т.д.) **не** вводилась.
- Продуктовый UX вкладок **не** менялся ради рефакторинга.

---

## Связь с другими этапами

- **2.5** можно вести поверх текущего API и структуры фронта.
- **3 / 3.5 / 4** — опираться на DTO и серверные агрегаты при расширении экранов.
