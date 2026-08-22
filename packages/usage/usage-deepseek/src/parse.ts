/**
 * Lenient JSON parsing for the DeepSeek platform/API endpoints. These are
 * private dashboard endpoints whose response shape may drift, so every read
 * is optional and unknown entries are ignored rather than rejected. Pure
 * functions of their input so unit tests cover every branch without a host.
 * @module @deepseek-ai/dsh-usage-deepseek/parse
 */

import type { BalanceView, CategoryBreakdown, DailyUsage, UsageCategoryKind, UsageSummary } from './types.ts'

// ── reading helpers ─────────────────────────────────────────────────────────

/** Narrow an unknown value to a plain object record, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Return the value as an array, or an empty array for any non-array. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Return the value as a non-null string, or null. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Return a finite number, accepting numeric strings, or null. */
function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// ── payload vocabulary ──────────────────────────────────────────────────────

/** One `{ model, usage: [{ type, amount }] }` entry. */
interface RawModelUsage {
  readonly model: string | null
  readonly usage: readonly { readonly type: string; readonly amount: number }[]
}

/** One `{ date, data: RawModelUsage[] }` entry. */
interface RawDayUsage {
  readonly date: string | null
  readonly data: readonly RawModelUsage[]
}

/** Shared amount/cost payload projection after envelope unwrapping. */
export interface RawUsagePayload {
  readonly total: readonly RawModelUsage[]
  readonly days: readonly RawDayUsage[]
  readonly currency: string | null
}

/** Category discriminants as the platform spells them. */
const TOKEN_TYPE = {
  CACHE_HIT: 'PROMPT_CACHE_HIT_TOKEN',
  CACHE_MISS: 'PROMPT_CACHE_MISS_TOKEN',
  RESPONSE: 'RESPONSE_TOKEN',
  REQUEST: 'REQUEST',
} as const

/** Map a platform usage `type` to its domain category, or null when unknown. */
function categoryOf(type: string): UsageCategoryKind | null {
  switch (type) {
    case TOKEN_TYPE.CACHE_HIT: return 'cache-hit'
    case TOKEN_TYPE.CACHE_MISS: return 'cache-miss'
    case TOKEN_TYPE.RESPONSE: return 'output'
    case TOKEN_TYPE.REQUEST: return 'request'
    default: return null
  }
}

// ── structural readers ──────────────────────────────────────────────────────

function parseModelUsages(value: unknown): RawModelUsage[] {
  const out: RawModelUsage[] = []
  for (const item of asArray(value)) {
    const record = asRecord(item)
    if (record === null) continue
    const usage: { type: string; amount: number }[] = []
    for (const entry of asArray(record['usage'])) {
      const usageRecord = asRecord(entry)
      if (usageRecord === null) continue
      const type = asString(usageRecord['type'])
      const amount = asFiniteNumber(usageRecord['amount'])
      if (type !== null && amount !== null) usage.push({ type, amount })
    }
    out.push({ model: asString(record['model']), usage })
  }
  return out
}

function parseDays(value: unknown): RawDayUsage[] {
  const out: RawDayUsage[] = []
  for (const item of asArray(value)) {
    const record = asRecord(item)
    if (record === null) continue
    out.push({ date: asString(record['date']), data: parseModelUsages(record['data']) })
  }
  return out
}

// ── envelope / balance parsing ──────────────────────────────────────────────

/**
 * Read a non-zero error code from a platform envelope (`code` or
 * `data.biz_code`), or null when the envelope reports success.
 * @param json - a decoded platform endpoint body.
 * @returns the first non-zero error code, or null.
 */
export function envelopeErrorCode(json: unknown): number | null {
  const record = asRecord(json)
  if (record === null) return null
  const code = asFiniteNumber(record['code'])
  if (code !== null && code !== 0) return code
  const data = asRecord(record['data'])
  if (data === null) return null
  const bizCode = asFiniteNumber(data['biz_code'])
  if (bizCode !== null && bizCode !== 0) return bizCode
  return null
}

/**
 * Parse the `usage/amount` body: `data.biz_data` is a single object.
 * @param json - decoded amount endpoint body.
 * @returns the unwrapped payload projection.
 */
export function parseAmountPayload(json: unknown): RawUsagePayload {
  const record = asRecord(json)
  const data = asRecord(record?.['data'])
  const bizData = asRecord(data?.['biz_data'])
  return {
    total: parseModelUsages(bizData?.['total']),
    days: parseDays(bizData?.['days']),
    currency: null,
  }
}

/**
 * Parse the `usage/cost` body: `data.biz_data` is an array whose first item
 * carries the currency.
 * @param json - decoded cost endpoint body.
 * @returns the unwrapped payload projection.
 */
export function parseCostPayload(json: unknown): RawUsagePayload {
  const record = asRecord(json)
  const data = asRecord(record?.['data'])
  const bizData = asRecord(asArray(data?.['biz_data'])[0])
  return {
    total: parseModelUsages(bizData?.['total']),
    days: parseDays(bizData?.['days']),
    currency: asString(bizData?.['currency']),
  }
}

/**
 * Parse the API-key balance body (`GET /user/balance`).
 * @param json - decoded balance endpoint body.
 * @returns the numeric balance view, or null when the body lacks `balance_infos`.
 */
export function parseApiBalance(json: unknown): BalanceView | null {
  const record = asRecord(json)
  if (record === null) return null
  const info = asRecord(asArray(record['balance_infos'])[0])
  if (info === null) return null
  return {
    currency: asString(info['currency']) ?? 'USD',
    totalBalance: asFiniteNumber(info['total_balance']) ?? 0,
    grantedBalance: asFiniteNumber(info['granted_balance']) ?? 0,
    toppedUpBalance: asFiniteNumber(info['topped_up_balance']) ?? 0,
    isAvailable: record['is_available'] === true,
    source: 'api-key',
  }
}

/**
 * Parse the platform user-summary balance body (`get_user_summary`): paid
 * (`normal_wallets`) and granted (`bonus_wallets`) balances are summed.
 * @param json - decoded user-summary body.
 * @returns the numeric balance view, or null when no wallet is present.
 */
export function parsePlatformBalance(json: unknown): BalanceView | null {
  const record = asRecord(json)
  const data = asRecord(record?.['data'])
  const bizData = asRecord(data?.['biz_data'])
  const normal = asRecord(asArray(bizData?.['normal_wallets'])[0])
  const bonus = asRecord(asArray(bizData?.['bonus_wallets'])[0])
  const currency = asString(normal?.['currency']) ?? asString(bonus?.['currency']) ?? 'CNY'
  const normalBalance = asFiniteNumber(normal?.['balance']) ?? 0
  const bonusBalance = asFiniteNumber(bonus?.['balance']) ?? 0
  if (normal === null && bonus === null) return null
  return {
    currency,
    totalBalance: normalBalance + bonusBalance,
    grantedBalance: bonusBalance,
    toppedUpBalance: normalBalance,
    isAvailable: true,
    source: 'platform',
  }
}

// ── aggregation ─────────────────────────────────────────────────────────────

/** Sum one usage `type` across model rows. */
function sumType(models: readonly RawModelUsage[], type: string): number {
  let total = 0
  for (const model of models) {
    for (const entry of model.usage) {
      if (entry.type === type) total += entry.amount
    }
  }
  return total
}

/** Sum token amounts (all token categories) across model rows. */
function sumTokens(models: readonly RawModelUsage[]): number {
  let total = 0
  for (const model of models) {
    for (const entry of model.usage) {
      if (categoryOf(entry.type) !== null && entry.type !== TOKEN_TYPE.REQUEST) total += entry.amount
    }
  }
  return total
}

/** Sum non-request amounts (i.e. cost rows) across model rows. */
function sumCost(models: readonly RawModelUsage[]): number {
  let total = 0
  for (const model of models) {
    for (const entry of model.usage) {
      const category = categoryOf(entry.type)
      if (category !== null && category !== 'request') total += entry.amount
    }
  }
  return total
}

/** UTC `YYYY-MM-DD` for one instant. */
function dayString(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${String(date.getUTCFullYear())}-${month}-${day}`
}

/**
 * Aggregate the amount and cost payloads into one current-month summary.
 * @param amount - the unwrapped amount payload.
 * @param cost - the unwrapped cost payload.
 * @param now - the instant anchoring "today" and the current month.
 * @returns the merged usage summary.
 */
export function aggregateUsage(amount: RawUsagePayload, cost: RawUsagePayload, now: Date): UsageSummary {
  const today = dayString(now)
  const currency = cost.currency ?? 'CNY'

  const amountByDay = new Map<string, RawModelUsage[]>()
  for (const day of amount.days) {
    if (day.date !== null) amountByDay.set(day.date, [...day.data])
  }
  const costByDay = new Map<string, RawModelUsage[]>()
  for (const day of cost.days) {
    if (day.date !== null) costByDay.set(day.date, [...day.data])
  }
  const dates = [...new Set([...amountByDay.keys(), ...costByDay.keys()])].sort()

  const daily: DailyUsage[] = dates.map(date => ({
    date,
    tokens: sumTokens(amountByDay.get(date) ?? []),
    cost: sumCost(costByDay.get(date) ?? []),
    requests: sumType(amountByDay.get(date) ?? [], TOKEN_TYPE.REQUEST),
  }))

  const categories: CategoryBreakdown[] = [
    {
      category: 'cache-hit',
      amount: sumType(amount.total, TOKEN_TYPE.CACHE_HIT),
      cost: sumType(cost.total, TOKEN_TYPE.CACHE_HIT),
    },
    {
      category: 'cache-miss',
      amount: sumType(amount.total, TOKEN_TYPE.CACHE_MISS),
      cost: sumType(cost.total, TOKEN_TYPE.CACHE_MISS),
    },
    {
      category: 'output',
      amount: sumType(amount.total, TOKEN_TYPE.RESPONSE),
      cost: sumType(cost.total, TOKEN_TYPE.RESPONSE),
    },
    {
      category: 'request',
      amount: sumType(amount.total, TOKEN_TYPE.REQUEST),
      cost: null,
    },
  ]

  let topModel: string | null = null
  let topTokens = 0
  for (const model of amount.total) {
    const tokens = sumTokens([model])
    if (tokens > topTokens) {
      topTokens = tokens
      topModel = model.model
    }
  }

  const todayAmounts = amountByDay.get(today) ?? []
  const todayCosts = costByDay.get(today) ?? []

  return {
    todayTokens: sumTokens(todayAmounts),
    todayCost: sumCost(todayCosts),
    currentMonthTokens: sumTokens(amount.total),
    currentMonthCost: sumCost(cost.total),
    requestCount: sumType(todayAmounts, TOKEN_TYPE.REQUEST),
    currentMonthRequestCount: sumType(amount.total, TOKEN_TYPE.REQUEST),
    topModel,
    categories,
    daily,
    currency,
  }
}
