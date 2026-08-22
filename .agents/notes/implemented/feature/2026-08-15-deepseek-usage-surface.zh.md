# Agent Note：DeepSeek 平台用量界面（余额与用量控制台）

Status: implemented

[English](2026-08-15-deepseek-usage-surface.md) | 中文

## 问题

DeepSeek Harness 操作者希望在 Web GUI 中查看 `platform.deepseek.com/usage` 的账户信息，包括余额、当月 token 用量、费用、请求数和每日序列。API Key 可以读取余额，但详细用量来自使用平台会话 token（`userToken`）而非 API Key 认证的私有控制台端点。浏览器端无法直接请求这些端点（无 CORS，且客户端不能持有密钥），外部静态 bundle 也无法访问，因为浏览器到宿主的 RPC 仅允许 `api-remotes` 中的固定列表。

## 决策

仓库内新增三个与 goal 能力拆分类似的包（服务位于宿主平面、工具位于 preset、浏览器端位于 roster）：

- **`dsh-usage-deepseek`** — 只读 `TypertRemoteService`（`ctx.usage`），公开一个 `@Remote('snapshot')` 方法。它在每次调用时通过 `ctx.credentials` 重新解析 `DEEPSEEK_API_KEY`（余额）和 `DEEPSEEK_PLATFORM_TOKEN`（用量），请求 `GET /user/balance`、`GET /api/v0/usage/amount` 和 `/usage/cost?month=&year=`，再通过宽松解析器（`parse.ts`）合并结果。解析器按可选字段读取，并将信封错误码 `40002`/`40003` 识别为会话过期。两个数据源分别降级为提示，因此 token 缺失时仍能返回余额。
- **`dsh-tool-usage`** — 模型可见的 `deepseek_usage` 工具；其规范值为不含每日序列的紧凑对象，以限制模型 token 成本。
- **`dsh-client-ui-usage`** — `settings.section` 页面（`id: 'usage'`，顺序 `30`），渲染余额、用量汇总、分类明细、每日 token 柱状图，以及通过 `api.credentials.describe/set/unset` 驱动的只写平台 token 控件；页面在转发的 `credentials/updated` 事件后刷新。

装配方式：`usage-deepseek` 和 `tool-usage` 在 `dsh-base` 的宿主平面挂载，因此 headless 也能获得该工具；`web-app` 禁用 `tool-usage`（由 preset 挂载）并把 `ui-usage` 加入浏览器 roster；标准 preset 挂载 `tool-usage`；`api-remotes` 导入并挂载 `@deepseek-ai/dsh-usage-deepseek/remote`，使浏览器能够调用 `ctx.remote.usage.snapshot()`。

使用私有端点的依据：amount/cost 端点未公开且可能变化，因此解析器不会因未知字段而整体失败，端点基础地址也作为测试可覆盖的 `Config` 字段。平台 token 通过现有凭据能力存储，其信任级别与 API Key 相同。

## 已考虑的替代方案

- **独立可安装 bundle**（`dsh plugin add`）。未采用：仓库外的浏览器端无法增加自己的 Remote 或转发事件，因此不能从宿主读取用量；只能提供宿主工具，会失去操作者要求的控制台页面。
- **通过 `get_user_summary` 获取平台余额**，而不是使用 API Key。暂缓：`parsePlatformBalance` 已提供，但 `snapshot()` 始终使用 API Key，以保持唯一余额来源。
- **停留在设置页时轮询控制台**。暂缓：页面只在挂载时和用户操作时刷新，默认轮询成本不合适。

## 后果

- 操作者粘贴平台 `userToken` 后，余额、用量汇总和每日图表才会完整显示；在此之前，页面显示余额和“配置 token”的提示。
- “今日”和月份参数使用 UTC，这很可能与平台计费时区一致；非 UTC 用户会在 UTC 午夜看到今日分桶切换。
- 私有端点字段变化会降级为解析提示而非整体失败，因此其他可用信息（包括余额）仍可显示。
