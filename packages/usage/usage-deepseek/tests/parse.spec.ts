import { describe, expect, it } from 'vitest'
import {
  aggregateUsage,
  envelopeErrorCode,
  parseAmountPayload,
  parseApiBalance,
  parseCostPayload,
  parsePlatformBalance,
} from '../src/parse.ts'

describe('parseApiBalance', () => {
  it('parses the API-key balance endpoint into a numeric view', () => {
    const view = parseApiBalance({
      is_available: true,
      balance_infos: [
        { currency: 'USD', total_balance: '50.25', granted_balance: '10.00', topped_up_balance: '40.25' },
      ],
    })
    expect(view).toEqual({
      currency: 'USD',
      totalBalance: 50.25,
      grantedBalance: 10,
      toppedUpBalance: 40.25,
      isAvailable: true,
      source: 'api-key',
    })
  })

  it('defaults currency to USD when absent', () => {
    const view = parseApiBalance({ is_available: false, balance_infos: [{ total_balance: '1' }] })
    expect(view?.currency).toBe('USD')
    expect(view?.isAvailable).toBe(false)
  })

  it('returns null when balance_infos is absent', () => {
    expect(parseApiBalance({ is_available: true })).toBeNull()
    expect(parseApiBalance(null)).toBeNull()
    expect(parseApiBalance('not-an-object')).toBeNull()
  })
})

describe('parsePlatformBalance', () => {
  it('sums normal and bonus wallets', () => {
    const view = parsePlatformBalance({
      data: {
        biz_data: {
          normal_wallets: [{ balance: '40', currency: 'CNY' }],
          bonus_wallets: [{ balance: '10', currency: 'CNY' }],
        },
      },
    })
    expect(view).toEqual({
      currency: 'CNY',
      totalBalance: 50,
      grantedBalance: 10,
      toppedUpBalance: 40,
      isAvailable: true,
      source: 'platform',
    })
  })

  it('returns null when no wallet is present', () => {
    expect(parsePlatformBalance({ data: { biz_data: {} } })).toBeNull()
  })
})

describe('envelopeErrorCode', () => {
  it('returns null for a success envelope', () => {
    expect(envelopeErrorCode({ code: 0, data: { biz_code: 0 } })).toBeNull()
    expect(envelopeErrorCode({})).toBeNull()
  })

  it('reads a top-level code first', () => {
    expect(envelopeErrorCode({ code: 40002 })).toBe(40002)
  })

  it('reads data.biz_code when top-level code is absent', () => {
    expect(envelopeErrorCode({ data: { biz_code: 40003 } })).toBe(40003)
  })
})

describe('payload parsing', () => {
  const amountJson = {
    code: 0,
    data: {
      biz_code: 0,
      biz_data: {
        total: [
          {
            model: 'deepseek-chat',
            usage: [
              { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '100' },
              { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '200' },
              { type: 'RESPONSE_TOKEN', amount: '300' },
              { type: 'REQUEST', amount: '10' },
            ],
          },
          {
            model: 'deepseek-reasoner',
            usage: [
              { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '50' },
              { type: 'RESPONSE_TOKEN', amount: '80' },
              { type: 'REQUEST', amount: '5' },
            ],
          },
        ],
        days: [
          {
            date: '2026-08-14',
            data: [
              { model: 'deepseek-chat', usage: [{ type: 'RESPONSE_TOKEN', amount: '40' }, { type: 'REQUEST', amount: '2' }] },
            ],
          },
          {
            date: '2026-08-15',
            data: [
              {
                model: 'deepseek-chat',
                usage: [
                  { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '20' },
                  { type: 'RESPONSE_TOKEN', amount: '30' },
                  { type: 'REQUEST', amount: '3' },
                ],
              },
            ],
          },
        ],
      },
    },
  }

  const costJson = {
    code: 0,
    data: {
      biz_code: 0,
      biz_data: [
        {
          currency: 'CNY',
          total: [
            {
              model: 'deepseek-chat',
              usage: [
                { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '0.001' },
                { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '0.002' },
                { type: 'RESPONSE_TOKEN', amount: '0.003' },
              ],
            },
          ],
          days: [
            {
              date: '2026-08-15',
              data: [{ model: 'deepseek-chat', usage: [{ type: 'RESPONSE_TOKEN', amount: '0.0003' }] }],
            },
          ],
        },
      ],
    },
  }

  it('unwraps the amount payload', () => {
    const payload = parseAmountPayload(amountJson)
    expect(payload.total).toHaveLength(2)
    expect(payload.days).toHaveLength(2)
    expect(payload.currency).toBeNull()
  })

  it('unwraps the cost payload array and currency', () => {
    const payload = parseCostPayload(costJson)
    expect(payload.currency).toBe('CNY')
    expect(payload.total).toHaveLength(1)
  })

  it('aggregates amount and cost into a month summary', () => {
    const usage = aggregateUsage(
      parseAmountPayload(amountJson),
      parseCostPayload(costJson),
      new Date('2026-08-15T12:00:00Z'),
    )
    expect(usage.currency).toBe('CNY')
    expect(usage.todayTokens).toBe(50)
    expect(usage.currentMonthTokens).toBe(730)
    expect(usage.requestCount).toBe(3)
    expect(usage.currentMonthRequestCount).toBe(15)
    expect(usage.topModel).toBe('deepseek-chat')
    expect(usage.todayCost).toBeCloseTo(0.0003, 6)
    expect(usage.currentMonthCost).toBeCloseTo(0.006, 6)
    expect(usage.categories).toEqual([
      { category: 'cache-hit', amount: 100, cost: 0.001 },
      { category: 'cache-miss', amount: 250, cost: 0.002 },
      { category: 'output', amount: 380, cost: 0.003 },
      { category: 'request', amount: 15, cost: null },
    ])
    expect(usage.daily.map(day => day.date)).toEqual(['2026-08-14', '2026-08-15'])
    const today = usage.daily[1]
    expect(today).toBeDefined()
    expect(today?.tokens).toBe(50)
    expect(today?.requests).toBe(3)
    expect(today?.cost).toBeCloseTo(0.0003, 6)
  })

  it('aggregates an empty payload into a zero summary', () => {
    const usage = aggregateUsage(
      { total: [], days: [], currency: null },
      { total: [], days: [], currency: null },
      new Date('2026-08-15T12:00:00Z'),
    )
    expect(usage.currentMonthTokens).toBe(0)
    expect(usage.topModel).toBeNull()
    expect(usage.daily).toEqual([])
    expect(usage.categories.map(c => c.amount)).toEqual([0, 0, 0, 0])
  })

  it('ignores unknown usage types', () => {
    const amount = parseAmountPayload({
      data: { biz_data: { total: [{ model: 'm', usage: [{ type: 'UNKNOWN', amount: '99' }] }], days: [] } },
    })
    const usage = aggregateUsage(amount, { total: [], days: [], currency: null }, new Date('2026-08-15T12:00:00Z'))
    expect(usage.currentMonthTokens).toBe(0)
  })
})
