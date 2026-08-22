/**
 * Read-only DeepSeek usage service: fetches the API-key balance and the
 * platform dashboard usage (amount + cost) endpoints, exposes one
 * `usage.snapshot` Remote the Web client renders, and degrades to per-source
 * notices instead of failing the whole read. Credentials are re-resolved per
 * call (never cached across operations), so a rotated key or pasted platform
 * token reaches the very next read without restarting anything.
 * @module @deepseek-ai/dsh-usage-deepseek
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import { aggregateUsage, envelopeErrorCode, parseAmountPayload, parseApiBalance, parseCostPayload } from './parse.ts'
import type { BalanceView, UsageSnapshot, UsageSummary } from './types.ts'

export type * from './types.ts'
export { aggregateUsage, envelopeErrorCode, parseAmountPayload, parseApiBalance, parseCostPayload, parsePlatformBalance } from './parse.ts'

/** Error codes the platform reports for a missing or expired session. */
const AUTH_EXPIRED_CODES = new Set([40002, 40003])

/** Failure classes the service turns into a snapshot notice. */
export type UsageFailureKind = 'network' | 'http' | 'auth-expired' | 'parse'

/** One contained fetch failure, safe to render as a notice. */
export class UsageFetchFailure extends Error {
  /** Stable failure class used to select the operator notice. */
  readonly kind: UsageFailureKind

  constructor(kind: UsageFailureKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** Plugin name. */
export const name = 'usage-deepseek'

/** Deployment-varying facts: credential references and endpoint bases. */
export interface Config {
  /** Credential reference for the DeepSeek API key; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv?: string
  /** Credential reference for the platform session token; defaults to `DEEPSEEK_PLATFORM_TOKEN`. */
  platformTokenEnv?: string
  /** API-key endpoint base (overridable in tests); defaults to the public API. */
  apiBaseUrl?: string
  /** Platform dashboard endpoint base; defaults to the public dashboard. */
  platformBaseUrl?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    usage: UsageService
  }
}

/** Human-readable notice for one contained failure, labelled by source. */
function noticeFor(error: unknown, source: '余额' | '用量'): string {
  /* v8 ignore next -- the fetch wrappers only throw UsageFetchFailure */
  if (!(error instanceof UsageFetchFailure)) return `${source}读取失败。`
  switch (error.kind) {
    case 'auth-expired':
      return `${source}读取失败：平台会话已过期，请重新获取并粘贴平台 token。`
    case 'network':
      return `${source}读取失败：网络错误（${error.message}）。`
    case 'http':
      return `${source}读取失败：平台返回错误（${error.message}）。`
    case 'parse':
      return `${source}读取失败：无法解析平台响应。`
  }
}

/** Read-only usage service (`ctx.usage`). */
export class UsageService extends TypertRemoteService {
  static inject = ['credentials']

  static Config: z<Config> = z.object({
    apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
    platformTokenEnv: z.string().role('credential-ref').default('DEEPSEEK_PLATFORM_TOKEN'),
    apiBaseUrl: z.string().default('https://api.deepseek.com'),
    platformBaseUrl: z.string().default('https://platform.deepseek.com'),
    timeoutMs: z.number().step(1).min(1000).max(120000).default(15000),
  })

  private readonly apiKeyEnv: CredentialRef
  private readonly platformTokenEnv: CredentialRef
  private readonly apiBaseUrl: string
  private readonly platformBaseUrl: string
  private readonly timeoutMs: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usage')
    this.apiKeyEnv = credentialRef(config.apiKeyEnv ?? 'DEEPSEEK_API_KEY')
    this.platformTokenEnv = credentialRef(config.platformTokenEnv ?? 'DEEPSEEK_PLATFORM_TOKEN')
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.deepseek.com'
    this.platformBaseUrl = config.platformBaseUrl ?? 'https://platform.deepseek.com'
    this.timeoutMs = config.timeoutMs ?? 15000
  }

  /**
   * Read balance and usage in one call. Balance comes from the API key, usage
   * from the platform session token; each source degrades independently into
   * a notice, so a missing token still returns the balance.
   * @returns the assembled snapshot.
   */
  @Remote('snapshot')
  async snapshot(): Promise<UsageSnapshot> {
    const notices: string[] = []
    const apiKey = await this.ctx.credentials.resolve(this.apiKeyEnv)
    const platformToken = await this.ctx.credentials.resolve(this.platformTokenEnv)

    let balance: BalanceView | null = null
    let usage: UsageSummary | null = null

    if (apiKey === undefined) {
      notices.push('未配置 DeepSeek API key（DEEPSEEK_API_KEY），无法读取余额。')
    } else {
      try {
        balance = await this.fetchBalance(apiKey.value)
      } catch (error) {
        notices.push(noticeFor(error, '余额'))
      }
    }

    if (platformToken === undefined) {
      notices.push('未配置平台会话 token（DEEPSEEK_PLATFORM_TOKEN），无法读取用量；请在用量页粘贴 token。')
    } else {
      try {
        usage = await this.fetchUsage(platformToken.value)
      } catch (error) {
        notices.push(noticeFor(error, '用量'))
      }
    }

    return {
      balance,
      usage,
      platformTokenConfigured: platformToken !== undefined,
      updatedAt: Date.now(),
      notices,
    }
  }

  /** Fetch and decode one authenticated JSON body. */
  private async fetchJson(url: string, token: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new UsageFetchFailure('network', error instanceof Error ? error.message : '网络错误')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new UsageFetchFailure('auth-expired', `HTTP ${String(response.status)}`)
      }
      throw new UsageFetchFailure('http', `HTTP ${String(response.status)}`)
    }
    try {
      return await response.json()
    } catch {
      throw new UsageFetchFailure('parse', '响应不是有效 JSON')
    }
  }

  /** Assert a platform envelope carried no non-zero error code. */
  private assertEnvelope(json: unknown): void {
    const code = envelopeErrorCode(json)
    if (code === null) return
    if (AUTH_EXPIRED_CODES.has(code)) {
      throw new UsageFetchFailure('auth-expired', `平台返回认证错误码 ${String(code)}`)
    }
    throw new UsageFetchFailure('http', `平台返回错误码 ${String(code)}`)
  }

  /** Fetch the API-key balance. */
  private async fetchBalance(apiKey: string): Promise<BalanceView> {
    const json = await this.fetchJson(`${this.apiBaseUrl}/user/balance`, apiKey)
    const balance = parseApiBalance(json)
    if (balance === null) throw new UsageFetchFailure('parse', '余额响应缺少 balance_infos')
    return balance
  }

  /** Fetch and merge the current month's amount and cost payloads. */
  private async fetchUsage(token: string): Promise<UsageSummary> {
    const now = new Date()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const year = String(now.getUTCFullYear())
    const base = `${this.platformBaseUrl}/api/v0/usage`
    const [amountJson, costJson] = await Promise.all([
      this.fetchJson(`${base}/amount?month=${month}&year=${year}`, token),
      this.fetchJson(`${base}/cost?month=${month}&year=${year}`, token),
    ])
    this.assertEnvelope(amountJson)
    this.assertEnvelope(costJson)
    return aggregateUsage(parseAmountPayload(amountJson), parseCostPayload(costJson), now)
  }
}

export default UsageService
