export type AccountDto = {
  id: string
  name: string
  isDefault: boolean
  source: "MANUAL" | "BINGX"
}

export type StrategyDto = {
  id: string
  name: string
  sortOrder: number
  timeframe: string | null
  setup: string | null
  riskNote: string | null
}

export type EmotionDto = {
  id: string
  name: string
  sortOrder: number
}

export type AccountsListDto = {
  accounts: AccountDto[]
}
