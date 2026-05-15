import { jsonErr } from "@/server/http/json-response"
import { toClientError } from "@/server/http/prisma-errors"

/** Логирует ошибку и возвращает envelope с классификацией Prisma. */
export function handleRouteError(e: unknown, fallbackLabel: string): Response {
  console.error(fallbackLabel, e)
  const { message, status } = toClientError(e)
  const hint =
    e instanceof Error && e.message.includes("findMany")
      ? " Остановите dev-сервер, выполните npx prisma migrate deploy и npx prisma generate."
      : ""
  const text =
    status === 500 && message === "Внутренняя ошибка сервера"
      ? fallbackLabel
      : `${message}${hint}`
  return jsonErr(text, status)
}
