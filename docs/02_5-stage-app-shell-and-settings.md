# Этап 2.5 — Вкладки приложения (App shell) + справочники (стратегии/эмоции)



**Зависимости:** этап **2** (домен сделок) и этап **2.3** ([`02_3-stage-architecture-and-api-consistency.md`](./02_3-stage-architecture-and-api-consistency.md)) — ✅.



Цель этапа: сделать структуру приложения “как продукт”: понятные вкладки/навигация, отдельные экраны по доменам и место для управления справочниками (стратегии, эмоции и т.п.).



## Требуемые вкладки (как ты описал)



1) **Портфель** (`/portfolio`) — ввод/вывод средств; связка с **`Account`** (см. `roadmap-full-v2.md`, этап 3.5)  

2) **Открытые сделки** (`/dashboard` или `/trades/open`) — ввод + список OPEN трейдов (выбор активного `Account` перед вводом сделки)  

3) **Закрытые сделки** (`/trades/closed`) — список CLOSED + фильтры по периоду  

4) **Аналитика** (`/analytics`)  

5) **Риск‑менеджмент** (`/risk`)  

6) **Настройки** (`/settings`) — общие настройки, интеграции, справочники

**Маршруты настроек (MVP):** `/settings` (обзор/ссылки), `/settings/accounts` — счета, `/settings/catalogs` — стратегии и эмоции.



## Definition of Done



- ✅ Единый layout с навигацией по вкладкам (**desktop + mobile**): шапка с токенами из `UI-GUIDELINES.md` (`globals.css`), бургер-меню на узких экранах.

- ✅ Пользователь выбирает **активный Account** в шапке (синхронизирован с `RiskSettings.activeAccountId`); новые сделки и дашборд фильтруются по этому счёту; на «Закрытые» — фильтр «текущий / все / конкретный счёт».

- ✅ Каждая вкладка — отдельный route и защита **auth middleware**.

- ✅ «Открытые» и «Закрытые» на разных страницах.

- ✅ В **Settings** MVP справочников:

  - список **счетов** (создание, переименование, счёт по умолчанию, удаление пустого)

  - список **стратегий** (CRUD)

  - список **эмоций** (CRUD)

  - в формах открытия/закрытия — **datalist** по справочнику + произвольный текст



## Данные и API (реализовано)



- Prisma: `Account`, `Strategy`, `Emotion`; `Trade.accountId`; `RiskSettings.activeAccountId`.

- `GET/PATCH /api/settings/trading` — в ответе и PATCH доступны `activeAccountId`, `journalAllAccounts` (режим журнала «все счета» vs фильтр по счёту в шапке).

- `GET/POST /api/settings/accounts`, `PATCH/DELETE /api/settings/accounts/[id]`.

- `GET/POST /api/settings/strategies`, `PATCH/DELETE /api/settings/strategies/[id]`.

- `GET/POST /api/settings/emotions`, `PATCH/DELETE /api/settings/emotions/[id]`.

- `GET /api/trades?accountId=...` — фильтр журнала по счёту.

- Первый заход: `ensureDefaultAndBackfill` создаёт «Основной» счёт и проставляет `accountId` на старых трейдах.



## Клиент (UI): что зафиксировано в коде

- **`settingsListsStore`** (`src/features/settings/settings-lists-store.ts`) — списки счетов/стратегий/эмоций вне React state + `useSyncExternalStore` в `SettingsPanels`, чтобы таблицы не терялись при кратковременном размонтировании (например, из‑за обновления сессии).
- **Гейт страниц:** `useProtectedPageSession` — если в next-auth уже есть `session`, считаем пользователя авторизованным (`authed`), чтобы не показывать полноэкранное «Загрузка…» и не снимать дерево настроек при фоновом refetch.
- **`ActiveAccountProvider`** — загрузка счетов для шапки и торговых дефолтов; при «Добавить счёт» вызывается `refresh` контекста без дублирования расчётов PnL в UI.
- **Часовой пояс (`/settings`):** `GET/PATCH /api/settings/trading` — поле `displayTimeZone` (IANA). В UI три режима: список популярных IANA; **по смещению UTC** — пресеты с подписями городов и сохранением стандартной IANA-зоны (`UTC_OFFSET_STYLE_PRESETS` в `src/lib/iana-time-zone.ts`, без голых `Etc/GMT*` в типовом выборе); свой IANA вручную. Ошибка сохранения из API при отсутствии колонки в БД подсказывает про миграции.
- **Асинхронные submit handler’ы:** до `await` сохранять ссылку на форму (`const form = e.currentTarget`), после ответа API вызывать `form.reset()` — иначе после `await` у синтетического события `currentTarget` ненадёжен, и цепочка обновления store после успешного POST может не выполниться.
- **Согласованность списка после мутаций:** перед локальным патчем store вызывается `bumpFetchGen()`, чтобы поздний ответ стартового `reload()` не перезаписал список устаревшим GET.



## Примечания



- Заглушки **Analytics / Risk / Portfolio** остаются до этапов 3 / 3.5 / 4.

- Полная модель **Account** из `roadmap-full-v2.md` (биржа, режим маржи) — позже; сейчас счёт — логическая группировка сделок пользователя.


