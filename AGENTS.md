---
description: 
alwaysApply: true
---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

**API:** новые и изменённые route handlers отвечают в формате `{ success, data?, error? }` (см. `src/server/http/json-response.ts`, клиент — `src/lib/api-fetch.ts`).

**Prisma (Windows):** для клиента после смены схемы используй `npm run db:generate` (перед генерацией автоматически останавливается типичный `next dev` на :3000 из этого репо — см. `scripts/prisma-safe-generate.cjs`). Прямой `npx prisma generate` при запущенном dev всё ещё может дать EPERM.
