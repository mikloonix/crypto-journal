import { Prisma } from "@prisma/client"

export function toClientError(e: unknown): { message: string; status: number } {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case "P2002":
        return { message: "Запись с такими данными уже существует", status: 409 }
      case "P2025":
        return { message: "Запись не найдена", status: 404 }
      case "P2003":
        return { message: "Связанная запись не найдена", status: 400 }
      case "P1001":
        return { message: "База данных недоступна", status: 503 }
      default:
        break
    }
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return { message: "База данных недоступна", status: 503 }
  }
  if (e instanceof Error) {
    const msg = e.message.trim()
    return { message: msg.length > 0 ? msg : "Внутренняя ошибка сервера", status: 500 }
  }
  return { message: "Внутренняя ошибка сервера", status: 500 }
}
