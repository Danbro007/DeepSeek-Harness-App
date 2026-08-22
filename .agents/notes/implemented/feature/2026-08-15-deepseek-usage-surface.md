# Agent Note: DeepSeek platform usage surface (balance + usage dashboard)

Status: implemented

English | [中文](2026-08-15-deepseek-usage-surface.zh.md)

## Problem

A DeepSeek Harness operator wanted the account information from `platform.deepseek.com/usage` — balance, current-month token usage, cost, request counts, and a daily series — visible inside the web GUI. Balance is reachable from the API key, but the detailed usage endpoints are private dashboard endpoints that authenticate with the platform session token (`userToken`), not the API key, so a browser half cannot fetch them directly (no CORS, no secret on the client) and an external static bundle cannot reach them either (the browser-to-host RPC surface is the fixed `api-remotes` allowlist).

## Decision

Three in-repo packages, mirroring the goal seam (service on the host plane, tool in the preset, browser half in the roster):

- **`dsh-usage-deepseek`** — a read-only `TypertRemoteService` (`ctx.usage`) exposing one `@Remote('snapshot')` method. It re-resolves `DEEPSEEK_API_KEY` (balance) and `DEEPSEEK_PLATFORM_TOKEN` (usage) through `ctx.credentials` per call, fetches `GET /user/balance` plus `GET /api/v0/usage/amount` and `/usage/cost?month=&year=`, and merges them in a lenient parser (`parse.ts`) that reads every field optionally and treats envelope codes `40002`/`40003` as an expired session. Each source degrades independently into a notice, so a missing token still returns balance.
- **`dsh-tool-usage`** — the model-facing `deepseek_usage` tool; canonical value is a compact object (no daily series) so it stays cheap for the model.
- **`dsh-client-ui-usage`** — a `settings.section` page (`id: 'usage'`, order `30`) rendering balance, the usage rollup, category breakdown, a daily-token bar chart, and a write-only platform-token credential control driven through `api.credentials.describe/set/unset`, refreshing on the forwarded `credentials/updated` event.

Wiring: `usage-deepseek` and `tool-usage` mount on the host plane in `dsh-base` (so headless also gets the tool); `web-app` disables `tool-usage` (the preset mounts it) and adds `ui-usage` to the browser roster; the standard preset mounts `tool-usage`; `api-remotes` imports and mounts `@deepseek-ai/dsh-usage-deepseek/remote` so the browser reaches `ctx.remote.usage.snapshot()`.

Why the private endpoints are acceptable: the amount/cost endpoints are undocumented and may drift, so the parser never hard-fails on an unknown field, and endpoint bases are `Config` fields overridable in tests. The platform token is a session credential stored through the existing credentials seam at the same trust level as the API key.

## Alternatives considered

- **Standalone installable bundle** (`dsh plugin add`). Rejected: a browser half outside the repo cannot add its own Remote or forwarded event, so it could not fetch usage host-side; only a host-only tool would fit, dropping the dashboard the operator asked for.
- **Platform balance from `get_user_summary`** instead of the API key. Deferred: `parsePlatformBalance` is shipped but `snapshot()` always uses the API key, keeping one balance authority.
- **Polling the dashboard** while the settings page stays open. Deferred: the page refreshes on mount and on demand; polling was judged the wrong default cost.

## Consequences

- The balance figure, usage rollup, and daily chart render only after the operator pastes their platform `userToken` once; until then the page shows balance and a "configure the token" notice.
- "Today" and the month parameter use UTC, matching the platform's likely billing timezone; a non-UTC operator may see the today bucket shift at UTC midnight.
- A shape change in the private endpoints degrades to a parse notice rather than a hard failure, so the surface stays usable (balance still renders).
