# Crypto Journal — единый роадмап (консолидировано)

Этот документ — “единый источник правды” по этапам. Подробности по каждому этапу лежат в отдельных файлах в `docs/`.

**Расширенная спецификация (модель данных, API, зависимости):** `roadmap-full-v2.md` — целевая модель: `Account`, `Trade.accountId`, комиссии/фандинг на `Exit` (агрегаты на `Trade`), поле маржи вместо «сырого» объёма.

**Визуальный стандарт UI:** `UI-GUIDELINES.md`.

**Статус этапа 2** (домен + журнал): выполнен по `02-stage-trades-domain-and-journal.md` (фильтры, группировки, карточки). **Статус этапа 2.3:** выполнен (см. `02_3-stage-architecture-and-api-consistency.md`). Следующий ориентир по разработке — **2.5**.

## Этапы

| Этап | Документ | Коротко |
|---:|---|---|
| 1 | `01-stage-foundation-stabilization.md` | фундамент: структура, auth, prisma, безопасность |
| 2 | `02-stage-trades-domain-and-journal.md` | домен сделок: trade + entries/exits, журнал |
| 2.3 ✅ | `02_3-stage-architecture-and-api-consistency.md` | слои backend, envelope API, DTO, data flow, декомпозиция UI |
| 2.5 | `02_5-stage-app-shell-and-settings.md` | app shell, справочники, выбор `Account` |
| 2.6 | `02_6-stage-dashboard-widgets.md` | PnL/ROI за день, цель дня, блок усреднения |
| 3 | `03-stage-analytics-and-visuals.md` | аналитика + графики (**обязательное** соответствие скринам в `docs/`) |
| 3.5 | `03_5-stage-portfolio-and-cashflows.md` | портфель, ввод/вывод, equity от депозитов |
| 4 | `04-stage-risk-management.md` | риск-менеджмент, правила, подсветка |
| 4.1 | `04_1-stage-cross-margin-risk.md` | кросс-маржа, совокупный риск, what-if ликвидации |
| 4.5 | `04_5-stage-forecast.md` | прогноз, цель по депозиту/дню, `/forecast` |
| 5 | `05-stage-import-export-and-bingx.md` | xlsx + BingX import/sync |
| 5.5 | `05_5-stage-testing.md` | unit/интеграционные тесты, CI |
| 6 | `06-stage-production-readiness.md` | прод: деплой, бэкапы, мониторинг |
| 7 | `07-stage-technical-enhancements.md` | PWA, OpenAPI, shared Zod-схемы |

## Вкладки приложения (целевой UX)

- `/portfolio` — портфель (cashflow)
- `/dashboard` — открытые (ввод + список OPEN)
- `/trades/closed` — закрытые (список CLOSED + детали)
- `/analytics` — аналитика
- `/forecast` — прогноз и цели (этап 4.5)
- `/risk` — риск-менеджмент
- `/settings` — настройки, интеграции, справочники

