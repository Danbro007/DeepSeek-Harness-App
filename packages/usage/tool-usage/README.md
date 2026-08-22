# @deepseek-ai/dsh-tool-usage

English | [中文](README.zh.md)

Model-facing `deepseek_usage` tool over `@deepseek-ai/dsh-usage-deepseek`. The canonical value is a compact object (no daily series) so the tool stays cheap for the model; the Web client's Usage settings page renders the full snapshot through the same service.

## Tool

`deepseek_usage` takes no parameters and returns a compact `UsageToolValue`: balance (or null), usage rollup (today/month tokens, cost, request counts, top model, category breakdown), and the snapshot notices. `output.render` formats it into Chinese prose.

The tool registers on `ctx.tools` and injects `['usage', 'tools']`.

## Model Experience

### The `deepseek_usage` tool result

#### What the model sees

The rendered result: a balance line (currency, paid/granted split, availability), today and month token/cost/request lines, the top model, a category breakdown, and any degradation notices. The exact schema is in the generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-usage).

#### Token effect

One tool result per call, data-dependent (a missing credential or an expired session adds one or two notice lines).

#### KV Cache effect

Append-only: the result extends the history tail; nothing here rewrites earlier request tokens.

## Known Limitations and Deferred Work

- **Daily series is omitted** — the tool value carries no per-day data to bound its token cost; the Web client renders the daily chart from the full snapshot instead.
