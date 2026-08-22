# @deepseek-ai/dsh-client-ui-usage

[English](README.md) | 中文

Web **用量**设置区包含余额卡片、用量汇总（今日/本月 token、费用、请求数、主要模型）、分类明细、每日 token 柱状图和平台 token 凭据控件。数据来自 `api-remotes` 挂载的 `usage` Remote；token 通过凭据域写入 `DEEPSEEK_PLATFORM_TOKEN`，该区域在 `credentials/updated` 时刷新。

## 扩展点

浏览器端注册一个 id 为 `usage`、顺序为 `30` 的 `settings.section` 贡献项；设置外壳负责导航入口和界面框架。插件激活时不会读取 Remote；用户选择页面并挂载后，控制器才调用 `ctx.remote.usage.snapshot()`，并通过 `credentials.describe` 查询 token 状态。

## 模型体验

无，因为本包只在浏览器设置中渲染宿主端快照，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **Token 输入只写** — 凭据域从不返回密钥，因此控件只能报告是否已配置，不能预填已有 token。
- **手动刷新** — 页面在挂载时和用户操作时获取数据，停留期间不会轮询。
