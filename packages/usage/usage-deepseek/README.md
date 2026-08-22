# @deepseek-ai/dsh-usage-deepseek

English | [中文](README.zh.md)

Read-only DeepSeek usage service (`ctx.usage`): fetches the API-key balance and the platform dashboard usage (amount + cost) endpoints and exposes one `usage.snapshot` Remote the Web client renders. Credentials are re-resolved per call (never cached across operations), so a rotated key or pasted platform token reaches the very next read without restarting anything.

## Service

`UsageService` (`@deepseek-ai/dsh-usage-deepseek`) is a `TypertRemoteService` exported as the package default, keyed `usage`. It declares `static inject = ['credentials']`.

### `@Remote('snapshot') snapshot(): Promise<UsageSnapshot>`

Reads balance and usage in one call. Balance comes from the API key, usage from the platform session token; each source degrades independently into a notice, so a missing token still returns the balance. Every read re-resolves both credentials and fetches fresh.

`UsageSnapshot` (see `./types`) carries:

- `balance` — `BalanceView | null` (currency, total/granted/topped-up, availability, source).
- `usage` — `UsageSummary | null` (today/month tokens, cost, request counts, top model, category breakdown, daily series).
- `platformTokenConfigured` — whether a token is configured, independent of its validity.
- `updatedAt` — epoch milliseconds the snapshot was assembled.
- `notices` — human-readable degradation notices (missing credentials, expired session, network).

## Config

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference for the DeepSeek API key (balance). |
| `platformTokenEnv` | `DEEPSEEK_PLATFORM_TOKEN` | Credential reference for the platform session token (usage). |
| `apiBaseUrl` | `https://api.deepseek.com` | API-key endpoint base (overridable in tests). |
| `platformBaseUrl` | `https://platform.deepseek.com` | Platform dashboard endpoint base. |
| `timeoutMs` | `15000` | Per-request timeout. |

## Data sources

Balance: `GET {apiBaseUrl}/user/balance` with `Authorization: Bearer <api key>`. Usage: `GET {platformBaseUrl}/api/v0/usage/amount` and `.../usage/cost` with `Authorization: Bearer <platform token>`, both with `month=<MM>&year=<YYYY>`. The platform endpoints are private dashboard endpoints (undocumented) whose response shape may drift; the lenient parsers in `./parse` read every field optionally and ignore unknown entries. Envelope error codes `40002`/`40003` classify as an expired session.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-usage`, which registers the model-facing `deepseek_usage` tool over this service; nothing model-visible originates in this package.

#### KV Cache effect

None of its own; the tool consumer owns the schema and result tokens.

## Known Limitations and Deferred Work

- **Private endpoints may change without notice** — amount/cost are not documented public API; parsing is defensive but a shape change would degrade to a parse notice rather than a hard failure.
- **No caching** — every `snapshot()` refetches both sources; frequent refreshes cost one balance request plus two usage requests.
- **UTC anchoring** — "today" and the month parameter use UTC, matching the platform's likely billing timezone; a user in another timezone may see today's bucket shift at UTC midnight.
- **Platform balance is not fetched** — balance always comes from the API key; `parsePlatformBalance` exists for future use but `snapshot()` does not call the user-summary endpoint.
