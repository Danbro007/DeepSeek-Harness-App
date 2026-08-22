# @deepseek-ai/dsh-usage-deepseek

[English](README.md) | 中文

只读 DeepSeek 用量服务（`ctx.usage`）：获取 API Key 余额和平台控制台的用量（数量与费用）端点，并公开 Web 客户端渲染的 `usage.snapshot` Remote。凭据会在每次调用时重新解析，不会跨操作缓存，因此轮换后的 Key 或新粘贴的平台 token 无需重启即可用于下一次读取。

## 服务

`UsageService`（`@deepseek-ai/dsh-usage-deepseek`）是以 `usage` 为键、作为包默认导出的 `TypertRemoteService`。它声明 `static inject = ['credentials']`。

### `@Remote('snapshot') snapshot(): Promise<UsageSnapshot>`

一次调用同时读取余额和用量。余额来自 API Key，用量来自平台会话 token；两个来源分别降级为提示，因此缺少 token 时仍会返回余额。每次读取都会重新解析两项凭据并重新请求。

`UsageSnapshot`（见 `./types`）包含：

- `balance` — `BalanceView | null`（币种、总额、赠送额、充值额、可用状态、来源）。
- `usage` — `UsageSummary | null`（今日/本月 token、费用、请求数、主要模型、分类明细、每日序列）。
- `platformTokenConfigured` — 是否已配置平台 token，与其是否有效无关。
- `updatedAt` — 组装快照时的 epoch 毫秒数。
- `notices` — 人类可读的降级提示（凭据缺失、会话过期、网络错误）。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | DeepSeek API Key（余额）的凭据引用。 |
| `platformTokenEnv` | `DEEPSEEK_PLATFORM_TOKEN` | 平台会话 token（用量）的凭据引用。 |
| `apiBaseUrl` | `https://api.deepseek.com` | API Key 端点基础地址（测试可覆盖）。 |
| `platformBaseUrl` | `https://platform.deepseek.com` | 平台控制台端点基础地址。 |
| `timeoutMs` | `15000` | 单次请求超时时间。 |

## 数据来源

余额通过带有 `Authorization: Bearer <api key>` 的 `GET {apiBaseUrl}/user/balance` 获取。用量通过带有 `Authorization: Bearer <platform token>` 的 `GET {platformBaseUrl}/api/v0/usage/amount` 和 `.../usage/cost` 获取，两个请求都携带 `month=<MM>&year=<YYYY>`。平台端点是未公开文档的私有控制台接口，其响应字段可能变化；`./parse` 中的宽松解析器会按可选字段读取并忽略未知项。信封错误码 `40002`/`40003` 会归类为会话过期。

## 模型体验

间接通过 `@deepseek-ai/dsh-tool-usage` 提供；后者在该服务之上注册模型可见的 `deepseek_usage` 工具，本包自身不产生模型可见内容。

#### KV Cache 影响

本包自身无影响；工具消费者负责 schema 和结果 token。

## 已知限制与后续工作

- **私有端点可能随时变化** — amount/cost 没有公开文档；解析会防御性降级，但字段变化仍可能产生解析提示。
- **无缓存** — 每次 `snapshot()` 都重新读取两个来源；频繁刷新会产生一次余额请求和两次用量请求。
- **UTC 基准** — “今日”和月份参数使用 UTC，这很可能与平台计费时区一致；其他时区的用户会在 UTC 午夜看到日期分桶切换。
- **不获取平台余额** — 余额始终来自 API Key；`parsePlatformBalance` 为后续用途保留，但 `snapshot()` 不调用用户摘要端点。
