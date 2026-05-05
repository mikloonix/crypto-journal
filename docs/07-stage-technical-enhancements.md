# Этап 7 — Технические улучшения (PWA + API спецификации)

Цель этапа: повысить качество разработки и пользовательский опыт за счёт PWA и документированного API.

## Definition of Done

- [ ] Приложение работает как **PWA** (установка на iOS/Android)
- [ ] Офлайн-режим: просмотр журнала сделок без интернета
- [ ] API документирован (OpenAPI/Swagger) доступен на `/api-docs`
- [ ] Zod схемы вынесены в `shared/schemas` и используются везде
- [ ] Кэширование справочников (стратегии, эмоции, список монет)

## 1. PWA (Progressive Web App)

### Требования

- `manifest.json` с theme_color, icons, start_url
- Service Worker (Workbox или ручной)
- Кэширование:
  - статика (JS/CSS) — cache-first
  - API данные (список сделок) — network-first с fallback
- Офлайн-страница "Нет соединения"

### Критерии

- Lighthouse PWA score ≥ 90
- Установка работает на Android (Chrome) и iOS (Safari)

## 2. OpenAPI / Swagger

### Структура

- Генерация из Zod схем (zod-to-openapi)
- Эндпоинт `GET /api/openapi.json`
- UI: Swagger UI на `/api-docs`

### Обязательные схемы

- `TradeSchema`, `EntrySchema`, `ExitSchema`
- `CashflowSchema`
- `RiskSettingsSchema`
- `ForecastSchema`

## 3. Zod схемы (shared)
src/
shared/
schemas/
trade.schema.ts
entry.schema.ts
exit.schema.ts
risk.schema.ts
forecast.schema.ts
types/
(выведенные из схем)

## 4. Кэширование справочников

Стратегии и эмоции кэшируются:
- In-memory (Next.js cache) на 1 час
- Инвалидация при CRUD операциях

## Тест-план

- [ ] Установка PWA на устройстве
- [ ] Отключить сеть → журнал сделок работает (кэшированные данные)
- [ ] `/api-docs` показывает все эндпоинты
- [ ] Изменение справочника → новый запрос получает актуальные данные

## Риски

- Service Worker сложно отлаживать
- Кэширование API может показать устаревшие данные

