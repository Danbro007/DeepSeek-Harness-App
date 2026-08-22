/**
 * Pure wire-safe types of the DeepSeek usage domain, free of host-side
 * imports (cordis, credentials, tools). The one home of the balance and
 * usage vocabulary the `@Remote` method returns and the Web client renders.
 * @module @deepseek-ai/dsh-usage-deepseek/types
 */

/** Where the displayed balance figure came from. */
export type BalanceSource = 'api-key' | 'platform' | 'none'

/** One account balance view, already currency-selected and numeric. */
export interface BalanceView {
  /** Three-letter currency code (`USD`, `CNY`, …). */
  readonly currency: string
  /** Total spendable balance. */
  readonly totalBalance: number
  /** Granted (bonus) balance portion. */
  readonly grantedBalance: number
  /** Topped-up (paid) balance portion. */
  readonly toppedUpBalance: number
  /** Whether the API-key balance endpoint reports the account as callable. */
  readonly isAvailable: boolean
  /** Which endpoint supplied this balance. */
  readonly source: BalanceSource
}

/** Billing categories the platform usage endpoints report. */
export type UsageCategoryKind = 'cache-hit' | 'cache-miss' | 'output' | 'request'

/** One category's aggregate amount and (when known) cost for the current month. */
export interface CategoryBreakdown {
  /** Category this row aggregates. */
  readonly category: UsageCategoryKind
  /** Token count, or request count when `category` is `request`. */
  readonly amount: number
  /** Cost for this category, or null when the cost endpoint did not supply it. */
  readonly cost: number | null
}

/** One day's aggregated usage. */
export interface DailyUsage {
  /** UTC day string `YYYY-MM-DD`. */
  readonly date: string
  /** Total tokens that day. */
  readonly tokens: number
  /** Total cost that day (zero when the cost endpoint did not supply it). */
  readonly cost: number
  /** Request count that day. */
  readonly requests: number
}

/** Current-month usage rollup derived from the amount and cost endpoints. */
export interface UsageSummary {
  /** Tokens used today (UTC). */
  readonly todayTokens: number
  /** Cost used today (zero when the cost endpoint did not supply it). */
  readonly todayCost: number
  /** Tokens used in the current month. */
  readonly currentMonthTokens: number
  /** Cost used in the current month (zero when the cost endpoint did not supply it). */
  readonly currentMonthCost: number
  /** Requests made today. */
  readonly requestCount: number
  /** Requests made in the current month. */
  readonly currentMonthRequestCount: number
  /** Model with the highest current-month token count, or null when no usage exists. */
  readonly topModel: string | null
  /** Current-month category breakdown. */
  readonly categories: readonly CategoryBreakdown[]
  /** Daily series for the current month, ascending by date. */
  readonly daily: readonly DailyUsage[]
  /** Currency code the cost endpoint reported. */
  readonly currency: string
}

/** Everything the Web client and tool read in one call. */
export interface UsageSnapshot {
  /** Current balance, or null when no credential supplied it. */
  readonly balance: BalanceView | null
  /** Current-month usage, or null when the platform session could not supply it. */
  readonly usage: UsageSummary | null
  /** Whether a platform session token is configured (independent of its validity). */
  readonly platformTokenConfigured: boolean
  /** Epoch milliseconds this snapshot was assembled. */
  readonly updatedAt: number
  /** Human-readable degradation notices (missing credentials, expired session, network). */
  readonly notices: readonly string[]
}
