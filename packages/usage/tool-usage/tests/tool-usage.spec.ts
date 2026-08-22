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
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import UsageService from '@deepseek-ai/dsh-usage-deepseek'
import * as toolUsage from '@deepseek-ai/dsh-tool-usage'

const contexts: Context[] = []
const testToolSignal = new AbortController().signal

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllGlobals()
})

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

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(balance: unknown, amount: unknown, cost: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/user/balance')) return jsonResponse(balance)
    if (url.includes('/usage/amount')) return jsonResponse(amount)
    if (url.includes('/usage/cost')) return jsonResponse(cost)
    throw new Error(`unexpected url ${url}`)
  }))
}

async function harness(options: { apiKey?: boolean; platformToken?: boolean } = { apiKey: true, platformToken: true }): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MemoryCredentials)
  const credentials = ctx.get('credentials') as MemoryCredentials
  if (options.apiKey !== false) await credentials.set(credentialRef('DEEPSEEK_API_KEY'), 'sk-test')
  if (options.platformToken !== false) await credentials.set(credentialRef('DEEPSEEK_PLATFORM_TOKEN'), 'token')
  await ctx.plugin(UsageService, { apiBaseUrl: 'https://api.test', platformBaseUrl: 'https://platform.test' })
  await ctx.plugin(toolUsage)
  return ctx
}

function textOf(result: ToolExecutionResult): string {
  const block = result.content[0]
  if (block?.type !== 'text') throw new Error('expected text tool result')
  return block.text
}

async function execute(ctx: Context): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${Math.random()}`),
    name: 'deepseek_usage',
    arguments: {},
  })
}

const BALANCE = {
  is_available: true,
  balance_infos: [{ currency: 'USD', total_balance: '50.25', granted_balance: '10', topped_up_balance: '40.25' }],
}

const AMOUNT = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      total: [
        {
          model: 'deepseek-chat',
          usage: [
            { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '1000' },
            { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '2000' },
            { type: 'RESPONSE_TOKEN', amount: '3000' },
            { type: 'REQUEST', amount: '7' },
          ],
        },
      ],
      days: [],
    },
  },
}

const COST = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: [
      {
        currency: 'USD',
        total: [{ model: 'deepseek-chat', usage: [{ type: 'RESPONSE_TOKEN', amount: '0.0123' }] }],
        days: [],
      },
    ],
  },
}

describe('tool-usage', () => {
  it('registers the deepseek_usage tool', async () => {
    stubFetch(BALANCE, AMOUNT, COST)
    const ctx = await harness()
    expect(ctx.tools.get('deepseek_usage')?.name).toBe('deepseek_usage')
  })

  it('renders a generic read card for a pending call', async () => {
    stubFetch(BALANCE, AMOUNT, COST)
    const ctx = await harness()
    expect(ctx.tools.get('deepseek_usage')?.presentCall?.({})).toEqual({
      card: 'generic',
      title: '查询 DeepSeek 用量',
      kind: 'read',
    })
  })

  it('returns a compact canonical value and Chinese prose', async () => {
    stubFetch(BALANCE, AMOUNT, COST)
    const ctx = await harness()
    const result = await execute(ctx)
    expect(result.isError).toBe(false)
    const value = result.value as {
      balance: { currency: string; total: number } | null
      usage: { monthTokens: number; topModel: string | null; categories: { amount: number }[] } | null
    }
    expect(value.balance).toMatchObject({ currency: 'USD', total: 50.25 })
    expect(value.usage).toMatchObject({ monthTokens: 6000, topModel: 'deepseek-chat' })
    const block = result.content[0]
    expect(block?.type).toBe('text')
    if (block?.type === 'text') {
      expect(block.text).toContain('余额：$50.25')
      expect(block.text).toContain('本月：6,000 tokens')
      expect(block.text).toContain('用量最高模型：deepseek-chat')
    }
  })

  it('degrades to null balance and usage when the platform rejects the token', async () => {
    stubFetch(
      BALANCE,
      { code: 40002, data: {} },
      { code: 40002, data: {} },
    )
    const ctx = await harness()
    const result = await execute(ctx)
    expect(result.isError).toBe(false)
    const value = result.value as { balance: { total: number } | null; usage: null }
    expect(value.balance).toMatchObject({ total: 50.25 })
    expect(value.usage).toBeNull()
    const block = result.content[0]
    if (block?.type === 'text') {
      expect(block.text).toContain('用量：不可用')
      expect(block.text).toContain('会话已过期')
    }
  })

  it('renders unconfigured states when neither credential is set', async () => {
    stubFetch(BALANCE, AMOUNT, COST)
    const ctx = await harness({ apiKey: false, platformToken: false })
    const text = textOf(await execute(ctx))
    expect(text).toContain('余额：未配置')
    expect(text).toContain('用量：不可用')
  })

  it('renders the unavailable warning when the account is disabled', async () => {
    stubFetch(
      { is_available: false, balance_infos: [{ currency: 'CNY', total_balance: '1', granted_balance: '0', topped_up_balance: '1' }] },
      AMOUNT,
      COST,
    )
    const ctx = await harness()
    expect(textOf(await execute(ctx))).toContain('账户不可用于 API 调用')
  })

  it('omits the top model and breakdown when there is no usage', async () => {
    stubFetch(
      BALANCE,
      { code: 0, data: { biz_code: 0, biz_data: { total: [], days: [] } } },
      { code: 0, data: { biz_code: 0, biz_data: [{ currency: 'USD', total: [], days: [] }] } },
    )
    const ctx = await harness()
    const text = textOf(await execute(ctx))
    expect(text).not.toContain('用量最高模型')
    expect(text).not.toContain('分类：')
  })

  it('renders a zero cost when the cost endpoint has no data', async () => {
    stubFetch(
      BALANCE,
      AMOUNT,
      { code: 0, data: { biz_code: 0, biz_data: [{ currency: 'USD', total: [{ model: 'm', usage: [] }], days: [] }] } },
    )
    const ctx = await harness()
    expect(textOf(await execute(ctx))).toContain('$0.0000')
  })

  it('renders a CNY cost from the usage currency when balance is absent', async () => {
    stubFetch(
      BALANCE,
      AMOUNT,
      { code: 0, data: { biz_code: 0, biz_data: [{ currency: 'CNY', total: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: '0.5' }] }], days: [] }] } },
    )
    const ctx = await harness({ apiKey: false })
    expect(textOf(await execute(ctx))).toContain('¥0.5000')
  })

  it('omits the breakdown when every category amount is zero', async () => {
    stubFetch(
      BALANCE,
      { code: 0, data: { biz_code: 0, biz_data: { total: [{ model: 'm', usage: [{ type: 'REQUEST', amount: '0' }] }], days: [] } } },
      COST,
    )
    const ctx = await harness()
    expect(textOf(await execute(ctx))).not.toContain('分类：')
  })
})
