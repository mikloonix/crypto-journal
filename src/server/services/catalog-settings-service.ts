import type { EmotionDto, StrategyDto } from "@/contracts/settings-catalog"
import { emotionRepository } from "@/server/repositories/emotion-repository"
import { strategyRepository } from "@/server/repositories/strategy-repository"

function sDto(r: {
  id: string
  name: string
  sortOrder: number
  timeframe: string | null
  setup: string | null
  riskNote: string | null
}): StrategyDto {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    timeframe: r.timeframe,
    setup: r.setup,
    riskNote: r.riskNote,
  }
}

function bodyOptStr(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined
  const v = body[key]
  if (v === null) return null
  const t = String(v).trim()
  return t || null
}

function eDto(r: { id: string; name: string; sortOrder: number }): EmotionDto {
  return { id: r.id, name: r.name, sortOrder: r.sortOrder }
}

export const catalogSettingsService = {
  async listStrategies(userId: string): Promise<{ strategies: StrategyDto[] }> {
    const rows = await strategyRepository.listByUser(userId)
    return { strategies: rows.map(sDto) }
  },

  async createStrategy(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; strategy: StrategyDto }
    | { ok: false; error: string; status: number }
  > {
    const name = String(body.name ?? "").trim()
    if (!name) {
      return { ok: false, error: "Нужно название", status: 400 }
    }
    try {
      const row = await strategyRepository.create(userId, {
        name,
        timeframe: bodyOptStr(body, "timeframe"),
        setup: bodyOptStr(body, "setup"),
        riskNote: bodyOptStr(body, "riskNote"),
      })
      return { ok: true, strategy: sDto(row) }
    } catch {
      return { ok: false, error: "Такая стратегия уже есть", status: 409 }
    }
  },

  async patchStrategy(
    userId: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; strategy: StrategyDto }
    | { ok: false; error: string; status: number }
  > {
    const cur = await strategyRepository.listByUser(userId)
    if (!cur.find((x) => x.id === id)) {
      return { ok: false, error: "Not found", status: 404 }
    }
    const name = body.name != null ? String(body.name).trim() : undefined
    const sortOrder =
      body.sortOrder != null && body.sortOrder !== ""
        ? Number(body.sortOrder)
        : undefined
    const timeframe = bodyOptStr(body, "timeframe")
    const setup = bodyOptStr(body, "setup")
    const riskNote = bodyOptStr(body, "riskNote")
    if (
      name === undefined &&
      sortOrder === undefined &&
      timeframe === undefined &&
      setup === undefined &&
      riskNote === undefined
    ) {
      return { ok: false, error: "Нет полей для обновления", status: 400 }
    }
    if (name !== undefined && !name) {
      return { ok: false, error: "Пустое имя", status: 400 }
    }
    if (sortOrder !== undefined && !Number.isFinite(sortOrder)) {
      return { ok: false, error: "Некорректный sortOrder", status: 400 }
    }
    try {
      const updated = await strategyRepository.update(userId, id, {
        ...(name !== undefined ? { name } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Math.round(sortOrder) } : {}),
        ...(timeframe !== undefined ? { timeframe } : {}),
        ...(setup !== undefined ? { setup } : {}),
        ...(riskNote !== undefined ? { riskNote } : {}),
      })
      if (!updated) {
        return { ok: false, error: "Not found", status: 404 }
      }
      return { ok: true, strategy: sDto(updated) }
    } catch {
      return { ok: false, error: "Имя уже занято", status: 409 }
    }
  },

  async deleteStrategy(
    userId: string,
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    const r = await strategyRepository.delete(userId, id)
    if (r.count === 0) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true }
  },

  async listEmotions(userId: string): Promise<{ emotions: EmotionDto[] }> {
    const rows = await emotionRepository.listByUser(userId)
    return { emotions: rows.map(eDto) }
  },

  async createEmotion(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; emotion: EmotionDto }
    | { ok: false; error: string; status: number }
  > {
    const name = String(body.name ?? "").trim()
    if (!name) {
      return { ok: false, error: "Нужно название", status: 400 }
    }
    try {
      const row = await emotionRepository.create(userId, name)
      return { ok: true, emotion: eDto(row) }
    } catch {
      return { ok: false, error: "Такая эмоция уже есть", status: 409 }
    }
  },

  async patchEmotion(
    userId: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; emotion: EmotionDto }
    | { ok: false; error: string; status: number }
  > {
    const cur = await emotionRepository.listByUser(userId)
    if (!cur.find((x) => x.id === id)) {
      return { ok: false, error: "Not found", status: 404 }
    }
    const name = body.name != null ? String(body.name).trim() : undefined
    const sortOrder =
      body.sortOrder != null && body.sortOrder !== ""
        ? Number(body.sortOrder)
        : undefined
    if (name === undefined && sortOrder === undefined) {
      return { ok: false, error: "Нет полей для обновления", status: 400 }
    }
    if (name !== undefined && !name) {
      return { ok: false, error: "Пустое имя", status: 400 }
    }
    if (sortOrder !== undefined && !Number.isFinite(sortOrder)) {
      return { ok: false, error: "Некорректный sortOrder", status: 400 }
    }
    try {
      const updated = await emotionRepository.update(userId, id, {
        ...(name !== undefined ? { name } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Math.round(sortOrder) } : {}),
      })
      if (!updated) {
        return { ok: false, error: "Not found", status: 404 }
      }
      return { ok: true, emotion: eDto(updated) }
    } catch {
      return { ok: false, error: "Имя уже занято", status: 409 }
    }
  },

  async deleteEmotion(
    userId: string,
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    const r = await emotionRepository.delete(userId, id)
    if (r.count === 0) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true }
  },
}
