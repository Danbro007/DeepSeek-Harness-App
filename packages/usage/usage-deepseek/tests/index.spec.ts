import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo,
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import UsageService from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllGlobals()
})

/** In-memory credential provider for the harness. */
class MemoryCredentials extends CredentialProvider {
  private readonly values = new Map<string, string>()
  private readonly records = new Map<CredentialKey, CredentialRecord>()

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'file' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    const configured = this.values.has(ref)
    return Promise.resolve({ configured, ...configured ? { source: 'file' } : {}, writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    return Promise.resolve()
  }

  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = this.records.get(key)
    return Promise.resolve(record === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: record.kind, writable: true })
  }

  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records].map(([key, record]) => ({ key, kind: record.kind })))
  }

  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const current = this.records.get(key)
    const next = await mutate(current)
    if (next === undefined) return current
    this.records.set(key, next)
    return next
  }

  deleteRecord(key: CredentialKey): Promise<void> {
    this.records.delete(key)
    return Promise.resolve()
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

const BALANCE_JSON = {
  is_available: true,
  balance_infos: [{ currency: 'USD', total_balance: '50.25', granted_balance: '10', topped_up_balance: '40.25' }],
}

const AMOUNT_JSON = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      total: [{ model: 'deepseek-chat', usage: [{ type: 'RESPONSE_TOKEN', amount: '300' }, { type: 'REQUEST', amount: '10' }] }],
      days: [],
    },
  },
}

const COST_JSON = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: [{ currency: 'USD', total: [{ model: 'deepseek-chat', usage: [{ type: 'RESPONSE_TOKEN', amount: '0.003' }] }], days: [] }],
  },
}

async function harness(options: { apiKey?: string; platformToken?: string } = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MemoryCredentials)
  const credentials = ctx.get('credentials') as MemoryCredentials
  if (options.apiKey !== undefined) await credentials.set(credentialRef('DEEPSEEK_API_KEY'), options.apiKey)
  if (options.platformToken !== undefined) await credentials.set(credentialRef('DEEPSEEK_PLATFORM_TOKEN'), options.platformToken)
  await ctx.plugin(UsageService, {
    apiBaseUrl: 'https://api.test',
    platformBaseUrl: 'https://platform.test',
  })
  return { ctx, usage: ctx.get('usage') as UsageService }
}

/** Stub fetch that answers the three endpoints from the given bodies. */
function stubFetch(overrides: { balance?: Response; amount?: Response; cost?: Response } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/user/balance')) {
      return overrides.balance ?? jsonResponse(BALANCE_JSON)
    }
    if (url.includes('/usage/amount')) {
      return overrides.amount ?? jsonResponse(AMOUNT_JSON)
    }
    if (url.includes('/usage/cost')) {
      return overrides.cost ?? jsonResponse(COST_JSON)
    }
    throw new Error(`unexpected url ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('UsageService.snapshot', () => {
  it('degrades to notices when no credentials are configured', async () => {
    stubFetch()
    const { usage } = await harness()
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.usage).toBeNull()
    expect(snapshot.platformTokenConfigured).toBe(false)
    expect(snapshot.notices).toHaveLength(2)
  })

  it('returns balance only when the platform token is missing', async () => {
    stubFetch()
    const { usage } = await harness({ apiKey: 'sk-test' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toMatchObject({ totalBalance: 50.25, source: 'api-key' })
    expect(snapshot.usage).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('DEEPSEEK_PLATFORM_TOKEN'))).toBe(true)
  })

  it('returns balance and usage when both credentials are configured', async () => {
    stubFetch()
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toMatchObject({ currency: 'USD', totalBalance: 50.25 })
    expect(snapshot.usage).toMatchObject({ currentMonthTokens: 300, currentMonthRequestCount: 10 })
    expect(snapshot.platformTokenConfigured).toBe(true)
    expect(snapshot.notices).toEqual([])
  })

  it('classifies a 401 balance response as an expired-session notice', async () => {
    stubFetch({ balance: jsonResponse({}, 401) })
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('会话已过期'))).toBe(true)
  })

  it('classifies a 500 balance response as an http notice', async () => {
    stubFetch({ balance: jsonResponse({}, 500) })
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('HTTP 500'))).toBe(true)
  })

  it('classifies a missing balance_infos body as a parse notice', async () => {
    stubFetch({ balance: jsonResponse({ is_available: true }) })
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('无法解析'))).toBe(true)
  })

  it('classifies an expired-session envelope code on the amount endpoint', async () => {
    stubFetch({
      amount: jsonResponse({ code: 40002, data: {} }),
    })
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.usage).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('会话已过期'))).toBe(true)
  })

  it('classifies a non-zero envelope code as an http notice', async () => {
    stubFetch({
      amount: jsonResponse({ code: 500, data: {} }),
    })
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.usage).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('错误码 500'))).toBe(true)
  })

  it('classifies a thrown fetch as a network notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.usage).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('网络错误'))).toBe(true)
  })

  it('classifies a non-JSON body as a parse notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.notices.some(notice => notice.includes('无法解析'))).toBe(true)
  })

  it('handles a non-Error fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'boom-string' }))
    const { usage } = await harness({ apiKey: 'sk-test', platformToken: 'token' })
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toBeNull()
    expect(snapshot.notices.some(notice => notice.includes('网络错误'))).toBe(true)
  })

  it('honors a fully-customized config', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemoryCredentials)
    const credentials = ctx.get('credentials') as MemoryCredentials
    await credentials.set(credentialRef('CUSTOM_KEY'), 'sk-custom')
    await credentials.set(credentialRef('CUSTOM_TOKEN'), 'token-custom')
    await ctx.plugin(UsageService, {
      apiKeyEnv: 'CUSTOM_KEY',
      platformTokenEnv: 'CUSTOM_TOKEN',
      apiBaseUrl: 'https://custom-api.test',
      platformBaseUrl: 'https://custom-platform.test',
      timeoutMs: 20000,
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('custom-api.test/user/balance')) return jsonResponse(BALANCE_JSON)
      if (url.includes('custom-platform.test/api/v0/usage/amount')) return jsonResponse(AMOUNT_JSON)
      if (url.includes('custom-platform.test/api/v0/usage/cost')) return jsonResponse(COST_JSON)
      throw new Error(`unexpected url ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const usage = ctx.get('usage') as UsageService
    const snapshot = await usage.snapshot()
    expect(snapshot.balance).toMatchObject({ totalBalance: 50.25 })
    expect(snapshot.platformTokenConfigured).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('constructs with the deployment defaults when no config is supplied', () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => new UsageService(ctx)).not.toThrow()
  })
})
