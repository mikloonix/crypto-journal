# Crypto Journal

Дневник трейдера: Next.js (App Router), PostgreSQL, Prisma, NextAuth (credentials + JWT).

## Требования

- Node.js 20+
- PostgreSQL

## Настройка

1. Скопируйте `.env.example` в `.env` и заполните переменные.
2. Примените схему и сиды:

```bash
npx prisma migrate deploy   # прод / уже существующая БД
# или для локальной разработки с нуля:
npx prisma migrate dev
npm run db:seed
```

Если БД уже создана через `db push` и `migrate deploy` выдаёт **P3005**, один раз выполните baseline — см. `docs/04-stage-risk-management.md` (раздел Prisma).

Учётная запись после сида: `admin@crypto-journal.com` / `trader123` (смените пароль в проде).

## Разработка

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Структура

- Приложение и API: `src/app/`
- Общий код: `src/lib/`, `src/components/`
- Документация по этапам доработки: `docs/`

## Сборка

```bash
npm run build
npm start
```
