# @deepseek-ai/dsh-tool-usage

[English](README.md) | 中文

基于 `@deepseek-ai/dsh-usage-deepseek` 的模型可见 `deepseek_usage` 工具。规范值采用紧凑对象且不包含每日序列，以限制模型 token 成本；Web 客户端的用量设置页通过同一服务渲染完整快照。

## 工具

`deepseek_usage` 不接收参数，返回紧凑的 `UsageToolValue`：余额（或 null）、用量汇总（今日/本月 token、费用、请求数、主要模型和分类明细）以及快照提示。`output.render` 将其格式化为中文文本。

工具注册到 `ctx.tools`，并注入 `['usage', 'tools']`。

## 模型体验

### `deepseek_usage` 工具结果

#### 模型看到的内容

渲染结果包含余额行（币种、充值/赠送拆分、可用状态）、今日与本月 token/费用/请求行、主要模型、分类明细以及降级提示。准确 schema 见生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-usage)。

#### Token 影响

每次调用产生一个工具结果，长度取决于数据；缺少凭据或会话过期时会增加一到两行提示。

#### KV Cache 影响

仅追加：结果扩展历史尾部，不重写此前的请求 token。

## 已知限制与后续工作

- **省略每日序列** — 工具值不携带逐日数据，以限制 token 成本；Web 客户端改为从完整快照渲染每日图表。
