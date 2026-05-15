# Crypto Journal — единый роадмап (консолидировано)

Этот документ — “единый источник правды” по этапам. Подробности по каждому этапу лежат в отдельных файлах в `docs/`.

**Расширенная спецификация (модель данных, API, зависимости):** `roadmap-full-v2.md` — целевая модель: `Account`, `Trade.accountId`, комиссии/фандинг на `Exit` (агрегаты на `Trade`), поле маржи вместо «сырого» объёма.

**Визуальный стандарт UI:** `UI-GUIDELINES.md`.

**Статус этапа 2** (домен + журнал): выполнен по `02-stage-trades-domain-and-journal.md` (фильтры, группировки, карточки). **Статус этапа 2.3:** выполнен. **Статус этапа 2.5:** выполнен (app shell, счета, справочники, см. `02_5-stage-app-shell-and-settings.md`). **Статус этапа 2.6 (MVP):** выполнен — см. `02_6-stage-dashboard-widgets.md`. **Этап 3.5:** выполнен. **Этап 4 (MVP):** выполнен — см. `04-stage-risk-management.md`. **Уточнения после MVP журнала/equity:** колонка «ROI деп.» на закрытых — от **equity журнала на момент закрытия сделки / времени выхода** (до учёта этой операции); legacy cashflow без `accountId` — к дефолтному счёту в односчётном скоупе (см. `03_5-stage-portfolio-and-cashflows.md`). Следующий ориентир — **4.1** (кросс-маржа) или **4.5** (прогноз), доработка аналитики этапа **3**.

## Этапы

| Этап | Документ | Коротко |
|---:|---|---|
| 1 | `01-stage-foundation-stabilization.md` | фундамент: структура, auth, prisma, безопасность |
| 2 | `02-stage-trades-domain-and-journal.md` | домен сделок: trade + entries/exits, журнал |
| 2.3 ✅ | `02_3-stage-architecture-and-api-consistency.md` | слои backend, envelope API, DTO, data flow, декомпозиция UI |
| 2.5 ✅ | `02_5-stage-app-shell-and-settings.md` | app shell, справочники, выбор `Account`, `/settings/accounts` + `/settings/catalogs` |
| 2.6 ✅ | `02_6-stage-dashboard-widgets.md` | PnL/ROI за день, усреднение; цель дня — 4.5; фиат — позже |
| 3 🔄 | `03-stage-analytics-and-visuals.md` | аналитика + графики; TZ из настроек; вкладки графиков без гистограммы «Распределение» в UI (см. док) |
| 3.5 ✅ | `03_5-stage-portfolio-and-cashflows.md` | портфель, ввод/вывод, equity от депозитов |
| 4 ✅ | `04-stage-risk-management.md` | риск-менеджмент, правила, подсветка (MVP; тесты — 5.5) |
| 4.1 | `04_1-stage-cross-margin-risk.md` | кросс-маржа, совокупный риск, what-if ликвидации |
| 4.5 | `04_5-stage-forecast.md` | прогноз, цель по депозиту/дню, `/forecast` |
| 5 | `05-stage-import-export-and-bingx.md` | xlsx + BingX import/sync |
| 5.5 | `05_5-stage-testing.md` | unit/интеграционные тесты, CI |
| 6 | `06-stage-production-readiness.md` | прод: деплой, бэкапы, мониторинг |
| 7 | `07-stage-technical-enhancements.md` | PWA, OpenAPI, shared Zod-схемы |
| 7.1 | `07_1-stage-architecture-and-quality-hardening.md` | слои UI/API, Zod на мутации, Prisma errors, гонки загрузки, лимиты аналитики, минимум тестов, черновик формы |

## Вкладки приложения (целевой UX)

- `/portfolio` — портфель (cashflow)
- `/dashboard` — открытые (ввод + список OPEN)
- `/trades/closed` — трейды (полностью CLOSED) и **сделки** (выходы по `exitAt`, в т.ч. частичные)
- `/analytics` — аналитика
- `/forecast` — прогноз и цели (этап 4.5)
- `/risk` — риск-менеджмент
- `/settings` — настройки, интеграции, справочники

