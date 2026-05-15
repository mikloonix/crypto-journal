import type { ZodError } from "zod"

export function zodErrorMessage(err: ZodError): string {
  const first = err.errors[0]
  if (!first) return "Некорректное тело запроса"
  const path = first.path.length ? `${first.path.join(".")}: ` : ""
  return `${path}${first.message}`
}
