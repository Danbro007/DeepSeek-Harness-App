# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

Web **Usage** settings section: a balance card, a usage rollup (today/month tokens, cost, requests, top model), a category breakdown, a daily-token bar chart, and the platform-token credential control. Data comes from the `usage` Remote mounted by `api-remotes`; the token is written through the credentials domain (`DEEPSEEK_PLATFORM_TOKEN`) and the section refreshes on `credentials/updated`.

## Extension point

The browser half registers one `settings.section` contribution with id `usage` (order `30`); the settings shell owns the navigation entry and chrome. It performs no Remote read during activation — selecting the page mounts it and its controller calls `ctx.remote.usage.snapshot()` plus `credentials.describe` for the token.

## Model Experience

None, as this package only renders a host-owned snapshot in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Token input is write-only** — the credential domain never returns a secret, so the control reports only whether one is configured and cannot prefill an existing token.
- **Refresh is manual** — the page fetches on mount and on demand; there is no polling while it stays open.
