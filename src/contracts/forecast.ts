/** Этап 4.5 — таблица прогноза и сводки. Все суммы USDT где не указано иначе. */

export type ForecastRowHighlightDto = "profit" | "loss" | "goal_deposit" | "goal_day" | "neutral"

export type ForecastTableRowDto = {
  kind: "planned" | "actual"
  tradeId: string | null
  /** ISO; для planned — null */
  closedAt: string | null
  depositBeforeUsdt: number
  pnlUsdt: number
  depositAfterUsdt: number
  /** PnL / депо до × 100 (факт по выходу). */
  depositRoiPct: number | null
  roiActualPct: number | null
  leverage: number | null
  planned: boolean
  highlight: ForecastRowHighlightDto
  /** Первая строка, где депо после ≥ цели по депозиту. */
  depositGoalStep: boolean
  /** Последний шаг серии с кумулятивным PnL ≥ цели дня. */
  dayGoalStep: boolean
}

export type ForecastAchievementDto = {
  targetDepositUsdt: number
  deadlineYmd: string
  /** Уже достигнуто (факт equity или симуляция до цели). */
  achieved: boolean
  achievedAtIso: string | null
  earlyByCalendarDays: number | null
  surplusUsdt: number | null
}

/** Темп плана и прогресс с даты старта (онлайн). */
export type ForecastProgressDto = {
  /** Средний темп: сделок до цели ÷ дней до дедлайна. */
  stepsPerDay: number | null
  /** true, если stepsPerDay не целое (например 41/46). */
  stepsPerDayIsFractional: boolean
  /** Календарных дней до цели при темпе stepsPerDay (≈ дней до дедлайна). */
  calendarDaysToGoalAtSchedule: number | null
  /**
   * Опережение к дедлайну (дни): если идти по 1 полному шагу в календарный день,
   * цель раньше, чем дедлайн — разница дней до дедлайна и числа сделок до цели.
   */
  aheadCalendarDaysVsDeadline: number | null
  startedAtYmd: string | null
  daysElapsedInclusive: number | null
  tradesSinceStart: number | null
  /** Сделок с ROI к депозиту ≥ планового ROI (онлайн). */
  tradesMatchingPlanRoi: number | null
  /** Ожидалось сделок к сегодня по графику от старта. */
  expectedTradesBySchedule: number | null
  /** Факт − ожидание, только если > 0 (онлайн). */
  aheadByTrades: number | null
}

export type ForecastSnapshotDto = {
  mode: "plan" | "online"
  /** Параметры из настроек (для формы). */
  forecastDepositTargetUsdt: number | null
  forecastPlanDepositTargetUsdt: number | null
  forecastTradeRoiPercent: number | null
  forecastPlanTradeRoiPercent: number | null
  forecastDeadlineYmd: string | null
  forecastStartedAtYmd: string | null
  forecastStartEquityUsdt: number | null
  /** Календарных дней до дедлайна включительно; 0 — сегодня дедлайн. */
  daysUntilDeadline: number | null
  rows: ForecastTableRowDto[]
  achievement: ForecastAchievementDto | null
  /** Цель на день: PnL за (сделок до цели ÷ дней до дедлайна) шагов с plan ROI от текущего депозита. */
  derivativeDayTargetUsdt: number | null
  /**
   * Сколько шагов (сделок) по плановому ROI нужно от текущего депозита до цели по депозиту;
   * 0 — цель уже достигнута; null — параметры не заданы.
   */
  tradesToReachGoal: number | null
  /**
   * Шагов (сделок) подряд в таблице, пока кумулятивный PnL не достигнет цели дня;
   * null если цель дня не задана или в таблице не набирается.
   */
  stepsToReachDayGoal: number | null
  progress: ForecastProgressDto | null
  /** База для режима: equity журнала (онлайн) или старт плана. */
  currentEquityUsdt: number
  /** Equity журнала (всегда), для справки в плане. */
  journalEquityUsdt?: number
  displayCurrency: "USDT"
}
