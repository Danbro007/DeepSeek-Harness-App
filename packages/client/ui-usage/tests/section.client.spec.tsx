// @vitest-environment jsdom
/** What the Usage section renders, and how its controls drive the callbacks. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'
import { UsageSettingsSection } from '../src/client/UsageSettingsSection.tsx'
import type { UsageSettingsSectionProps } from '../src/client/UsageSettingsSection.tsx'
import type { UsageState } from '../src/client/usage-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en) => en[key]

function snapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    balance: null,
    usage: null,
    platformTokenConfigured: false,
    updatedAt: 1,
    notices: [],
    ...overrides,
  }
}

function renderSection(state: Partial<UsageState> = {}) {
  const store = createSnapshotStore<UsageState>({
    snapshot: null,
    loading: false,
    tokenConfigured: false,
    tokenWritable: true,
    error: null,
    ...state,
  })
  const props = {
    t,
    useUsage: bindSnapshotSelector(store),
    refresh: vi.fn(async () => {}),
    setToken: vi.fn(async () => {}),
    clearToken: vi.fn(async () => {}),
  } as unknown as UsageSettingsSectionProps
  render(<UsageSettingsSection {...props} />)
  return props
}

describe('UsageSettingsSection', () => {
  it('renders the title and token section', () => {
    renderSection()
    expect(screen.getByText(en.title)).toBeTruthy()
    expect(screen.getByText(en.tokenSection)).toBeTruthy()
    expect(screen.getByText(en.tokenNotConfigured)).toBeTruthy()
  })

  it('renders empty states when the snapshot has no balance or usage', () => {
    renderSection({ snapshot: snapshot() })
    expect(screen.getByText(en.noBalance)).toBeTruthy()
    expect(screen.getByText(en.noUsage)).toBeTruthy()
  })

  it('renders balance and usage when present', () => {
    renderSection({
      snapshot: snapshot({
        balance: { currency: 'USD', totalBalance: 50.25, grantedBalance: 10, toppedUpBalance: 40.25, isAvailable: true, source: 'api-key' },
        usage: {
          todayTokens: 50,
          todayCost: 0.0003,
          currentMonthTokens: 730,
          currentMonthCost: 0.006,
          requestCount: 3,
          currentMonthRequestCount: 15,
          topModel: 'deepseek-chat',
          categories: [
            { category: 'cache-hit', amount: 100, cost: 0.001 },
            { category: 'cache-miss', amount: 250, cost: 0.002 },
            { category: 'output', amount: 380, cost: 0.003 },
            { category: 'request', amount: 15, cost: null },
          ],
          daily: [
            { date: '2026-08-14', tokens: 40, cost: 0, requests: 2 },
            { date: '2026-08-15', tokens: 50, cost: 0.0003, requests: 3 },
          ],
          currency: 'USD',
        },
      }),
    })
    expect(screen.getByText('$50.25')).toBeTruthy()
    expect(screen.getByText(en.topModel, { exact: false })).toBeTruthy()
    expect(screen.getByText(en.categoriesTitle)).toBeTruthy()
    expect(screen.getByText(en.dailyTitle)).toBeTruthy()
  })

  it('renders a warning when the account is unavailable', () => {
    renderSection({
      snapshot: snapshot({
        balance: { currency: 'CNY', totalBalance: 1, grantedBalance: 0, toppedUpBalance: 1, isAvailable: false, source: 'api-key' },
      }),
    })
    expect(screen.getByText(en.unavailable)).toBeTruthy()
  })

  it('renders notices', () => {
    renderSection({ snapshot: snapshot({ notices: ['缺少 token'] }) })
    expect(screen.getByText(en.noticesTitle)).toBeTruthy()
    expect(screen.getByText('缺少 token')).toBeTruthy()
  })

  it('calls refresh when the refresh button is pressed', () => {
    const props = renderSection()
    fireEvent.click(screen.getByText(en.refresh))
    expect(props.refresh).toHaveBeenCalled()
  })

  it('saves a non-empty token draft through setToken', () => {
    const props = renderSection({ tokenConfigured: true, tokenWritable: true })
    fireEvent.change(screen.getByPlaceholderText(en.tokenPlaceholder), { target: { value: '  token-1  ' } })
    fireEvent.click(screen.getByText(en.saveToken))
    expect(props.setToken).toHaveBeenCalledWith('token-1')
  })

  it('shows the clear control only when a token is configured', () => {
    renderSection({ tokenConfigured: false })
    expect(screen.queryByText(en.clearToken)).toBeNull()
    renderSection({ tokenConfigured: true })
    expect(screen.getByText(en.clearToken)).toBeTruthy()
  })

  it('clears the token through clearToken', () => {
    const props = renderSection({ tokenConfigured: true })
    fireEvent.click(screen.getByText(en.clearToken))
    expect(props.clearToken).toHaveBeenCalled()
  })

  it('shows a loading hint while loading', () => {
    renderSection({ loading: true })
    expect(screen.getByText(en.loading)).toBeTruthy()
  })

  it('shows an error message', () => {
    renderSection({ error: '读取失败' })
    expect(screen.getByText('读取失败')).toBeTruthy()
  })

  it('renders a zero-height chart bar when every day is empty', () => {
    renderSection({
      snapshot: snapshot({
        usage: {
          todayTokens: 0,
          todayCost: 0,
          currentMonthTokens: 0,
          currentMonthCost: 0,
          requestCount: 0,
          currentMonthRequestCount: 0,
          topModel: null,
          categories: [
            { category: 'cache-hit', amount: 0, cost: 0 },
            { category: 'cache-miss', amount: 0, cost: 0 },
            { category: 'output', amount: 0, cost: 0 },
            { category: 'request', amount: 0, cost: null },
          ],
          daily: [{ date: '2026-08-15', tokens: 0, cost: 0, requests: 0 }],
          currency: 'USD',
        },
      }),
    })
    expect(screen.getByRole('img', { name: en.dailyTitle })).toBeTruthy()
  })

  it('renders the empty usage hint when there are no daily entries', () => {
    renderSection({
      snapshot: snapshot({
        usage: {
          todayTokens: 0,
          todayCost: 0,
          currentMonthTokens: 0,
          currentMonthCost: 0,
          requestCount: 0,
          currentMonthRequestCount: 0,
          topModel: null,
          categories: [
            { category: 'cache-hit', amount: 0, cost: 0 },
            { category: 'cache-miss', amount: 0, cost: 0 },
            { category: 'output', amount: 0, cost: 0 },
            { category: 'request', amount: 0, cost: null },
          ],
          daily: [],
          currency: 'USD',
        },
      }),
    })
    expect(screen.getByText(en.noUsage)).toBeTruthy()
  })
})
