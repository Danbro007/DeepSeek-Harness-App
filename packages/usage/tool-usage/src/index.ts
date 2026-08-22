/**
 * Model-facing `deepseek_usage` tool over the DeepSeek usage read service.
 * The canonical value is a compact object (no daily series) so the tool stays
 * cheap for the model; the Web client's settings page renders the full
 * snapshot through the same service.
 * @module @deepseek-ai/dsh-tool-usage
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek'

export const name = 'tool-usage'
export const inject = ['usage', 'tools']

/** Compact canonical tool value: no daily series, costs summed to zero when absent. */
interface UsageToolValue {
  balance: {
    currency: string
    total: number
    granted: number
    toppedUp: number
    available: boolean
  } | null
  usage: {
    todayTokens: number
    todayCost: number
    monthTokens: number
    monthCost: number
    requests: number
    monthRequests: number
    topModel: string | null
    categories: { category: string; amount: number; cost: number | null }[]
  } | null
  notices: string[]
}

const NUMBER_OR_NULL = { oneOf: [{ type: 'number' }, { type: 'null' }] } as const

const STRING_OR_NULL = { oneOf: [{ type: 'string' }, { type: 'null' }] } as const

/** Canonical output declaration for the usage tool. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    balance: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            currency: { type: 'string', required: true },
            total: { type: 'number', required: true },
            granted: { type: 'number', required: true },
            toppedUp: { type: 'number', required: true },
            available: { type: 'boolean', required: true },
          },
        },
      ],
      required: true,
    },
    usage: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            todayTokens: { type: 'number', required: true },
            todayCost: { type: 'number', required: true },
            monthTokens: { type: 'number', required: true },
            monthCost: { type: 'number', required: true },
            requests: { type: 'number', required: true },
            monthRequests: { type: 'number', required: true },
            topModel: { ...STRING_OR_NULL, required: true },
            categories: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  category: { type: 'string', required: true },
                  amount: { type: 'number', required: true },
                  cost: { ...NUMBER_OR_NULL, required: true },
                },
              },
            },
          },
        },
      ],
      required: true,
    },
    notices: { type: 'array', items: { type: 'string' }, required: true },
  },
} as const

/** Currency symbol for rendering. */
function symbol(currency: string): string {
  return currency === 'CNY' ? '¥' : '$'
}

/** Group an integer with thousands separators. */
function group(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Format a cost with the snapshot currency. */
function money(value: number, currency: string): string {
  return `${symbol(currency)}${value.toFixed(4)}`
}

const CATEGORY_LABELS: Record<string, string> = {
  'cache-hit': '缓存命中输入',
  'cache-miss': '缓存未命中输入',
  output: '输出',
  request: '请求',
}

/** Localized category label, falling back to the raw category for unknown values. */
function categoryLabel(category: string): string {
  const label = CATEGORY_LABELS[category]
  /* v8 ignore next -- usage categories are the closed union, always present in CATEGORY_LABELS */
  if (label === undefined) return category
  return label
}

/** Format the compact value into model-facing Chinese prose. */
function renderText(value: UsageToolValue): string {
  const lines: string[] = []
  if (value.balance === null) {
    lines.push('余额：未配置')
  } else {
    const b = value.balance
    lines.push(
      `余额：${symbol(b.currency)}${b.total.toFixed(2)}`
      + `（充值 ${symbol(b.currency)}${b.toppedUp.toFixed(2)} / 赠送 ${symbol(b.currency)}${b.granted.toFixed(2)}）`
      + (b.available ? '' : '（账户不可用于 API 调用）'),
    )
  }
  if (value.usage === null) {
    lines.push('用量：不可用')
  } else {
    const u = value.usage
    lines.push(`今日：${group(u.todayTokens)} tokens · ${money(u.todayCost, currencyOf(value))} · ${group(u.requests)} 次请求`)
    lines.push(`本月：${group(u.monthTokens)} tokens · ${money(u.monthCost, currencyOf(value))} · ${group(u.monthRequests)} 次请求`)
    if (u.topModel !== null) lines.push(`用量最高模型：${u.topModel}`)
    const parts = u.categories
      .filter(c => c.amount > 0)
      .map(c => `${categoryLabel(c.category)} ${group(c.amount)}`)
    if (parts.length > 0) lines.push(`分类：${parts.join(' · ')}`)
  }
  for (const notice of value.notices) lines.push(`提示：${notice}`)
  return lines.join('\n')
}

/** Currency from the balance or the usage summary, for cost rendering. */
function currencyOf(value: UsageToolValue): string {
  if (value.balance !== null) return value.balance.currency
  return 'CNY'
}

/** Project the service snapshot into the compact canonical value. */
function toToolValue(snapshot: UsageSnapshot): UsageToolValue {
  const balance = snapshot.balance === null ? null : {
    currency: snapshot.balance.currency,
    total: snapshot.balance.totalBalance,
    granted: snapshot.balance.grantedBalance,
    toppedUp: snapshot.balance.toppedUpBalance,
    available: snapshot.balance.isAvailable,
  }
  const usage = snapshot.usage === null ? null : {
    todayTokens: snapshot.usage.todayTokens,
    todayCost: snapshot.usage.todayCost,
    monthTokens: snapshot.usage.currentMonthTokens,
    monthCost: snapshot.usage.currentMonthCost,
    requests: snapshot.usage.requestCount,
    monthRequests: snapshot.usage.currentMonthRequestCount,
    topModel: snapshot.usage.topModel,
    categories: snapshot.usage.categories.map(c => ({
      category: c.category,
      amount: c.amount,
      cost: c.cost,
    })),
  }
  return { balance, usage, notices: [...snapshot.notices] }
}

/** Register the `deepseek_usage` tool. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'deepseek_usage',
    description: 'Read the DeepSeek platform account usage: current balance (from the API key) '
      + 'and the current month token usage, cost, and request counts (from the platform session '
      + 'token, when configured). Call when the user asks about DeepSeek usage, balance, or spending.',
    parameters: {},
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderText(value) }],
    },
    async execute() {
      return toToolValue(await ctx.usage.snapshot())
    },
    presentCall: () => ({ card: 'generic', title: '查询 DeepSeek 用量', kind: 'read' }),
  }))
}
