import { describe, expect, it } from 'vitest'
import {
  aggregateUsage,
  envelopeErrorCode,
  parseAmountPayload,
  parseApiBalance,
  parseCostPayload,
  parsePlatformBalance,
} from '../src/parse.ts'

describe('lenient parsing edge cases', () => {
  it('skips non-object model and usage entries, and non-numeric amounts', () => {
    const payload = parseAmountPayload({
      data: {
        biz_data: {
          total: [
            'not-an-object',
            {
              model: 'm',
              usage: [
                'not-an-object',
                { type: 'RESPONSE_TOKEN' },
                { type: 'RESPONSE_TOKEN', amount: 'not-a-number' },
                { type: 'RESPONSE_TOKEN', amount: NaN },
                { type: 'RESPONSE_TOKEN', amount: Infinity },
                { type: 'UNKNOWN', amount: '5' },
              ],
            },
          ],
          days: [],
        },
      },
    })
    expect(payload.total).toHaveLength(1)
    expect(payload.total[0]?.usage).toEqual([{ type: 'UNKNOWN', amount: 5 }])
  })

  it('skips non-object day entries and keeps null dates', () => {
    const payload = parseAmountPayload({
      data: {
        biz_data: {
          total: [],
          days: ['not-an-object', { date: null, data: [] }, { date: '2026-08-15', data: [] }],
        },
      },
    })
    expect(payload.days).toHaveLength(2)
    expect(payload.days[0]?.date).toBeNull()
    expect(payload.days[1]?.date).toBe('2026-08-15')
  })

  it('returns null for a non-object envelope', () => {
    expect(envelopeErrorCode(null)).toBeNull()
    expect(envelopeErrorCode('not-an-object')).toBeNull()
  })

  it('defaults missing balance fields to zero and USD', () => {
    const view = parseApiBalance({ is_available: false, balance_infos: [{}] })
    expect(view).toMatchObject({ currency: 'USD', totalBalance: 0, grantedBalance: 0, toppedUpBalance: 0 })
  })

  it('sums a bonus-only platform balance and falls back to bonus currency', () => {
    const view = parsePlatformBalance({
      data: { biz_data: { normal_wallets: [], bonus_wallets: [{ balance: '7.5', currency: 'CNY' }] } },
    })
    expect(view).toMatchObject({ currency: 'CNY', totalBalance: 7.5, grantedBalance: 7.5, toppedUpBalance: 0 })
  })

  it('falls back to CNY when neither wallet names a currency', () => {
    const view = parsePlatformBalance({
      data: { biz_data: { normal_wallets: [{ balance: '1' }], bonus_wallets: [] } },
    })
    expect(view?.currency).toBe('CNY')
  })

  it('returns a cost-only day in the daily series', () => {
    const usage = aggregateUsage(
      { total: [], days: [], currency: null },
      {
        total: [],
        days: [{ date: '2026-08-15', data: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: 0.5 }] }] }],
        currency: 'USD',
      },
      new Date('2026-08-15T12:00:00Z'),
    )
    expect(usage.daily).toHaveLength(1)
    expect(usage.daily[0]).toMatchObject({ date: '2026-08-15', tokens: 0, cost: 0.5, requests: 0 })
  })

  it('treats a null-date day as absent from the daily series', () => {
    const usage = aggregateUsage(
      {
        total: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: 9 }] }],
        days: [{ date: null, data: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: 9 }] }] }],
        currency: null,
      },
      { total: [], days: [], currency: null },
      new Date('2026-08-15T12:00:00Z'),
    )
    expect(usage.daily).toEqual([])
    expect(usage.currentMonthTokens).toBe(9)
  })

  it('ignores unknown and request categories when summing cost', () => {
    const cost = parseCostPayload({
      data: {
        biz_data: [{
          currency: 'USD',
          total: [{ model: 'm', usage: [{ type: 'UNKNOWN', amount: '1' }, { type: 'REQUEST', amount: '2' }] }],
          days: [],
        }],
      },
    })
    const usage = aggregateUsage({ total: [], days: [], currency: null }, cost, new Date('2026-08-15T12:00:00Z'))
    expect(usage.currentMonthCost).toBe(0)
  })

  it('skips a null-date cost day from the daily series', () => {
    const usage = aggregateUsage(
      { total: [], days: [], currency: null },
      {
        total: [],
        days: [{ date: null, data: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: 0.5 }] }] }],
        currency: 'USD',
      },
      new Date('2026-08-15T12:00:00Z'),
    )
    expect(usage.daily).toEqual([])
  })
})
