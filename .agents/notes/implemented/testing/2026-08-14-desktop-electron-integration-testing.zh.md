# Agent Note: 基于真实进程冒烟测试的桌面 Electron 集成测试

Status: implemented

[English](2026-08-14-desktop-electron-integration-testing.md) | 中文

## 问题

macOS 桌面发行版此前没有任何针对其启动路径的自动化覆盖：没有任何机制证明 Electron 主进程能够启动受监管的 Web profile 并达到回环地址就绪。Playwright 的 Electron 驱动无法填补这一空白，因为它硬编码了 `--remote-debugging-port` 标志，而 Electron 40 及之后（均基于 Node 24）会在进程启动时拒绝该标志。

## 决策

`apps/desktop` 新增真实进程的 harness 生命周期冒烟测试（`tests/harness-process.lifecycle.e2e.ts`）：它以与 Electron 主进程完全相同的方式，用桌面 patch 启动 `pnpm --dir <repo> dsh web --port 0`，等待规范回环地址就绪行，然后关闭子进程。这在不依赖 GUI 的情况下覆盖了 spawn → ready → stop 路径。

Playwright Electron shell 测试（`tests/desktop.e2e.ts`）已写好，但被 `describe.skip` 跳过。一旦 Playwright 发行版移除硬编码的 `--remote-debugging-port` 标志，即移除该 skip；它已包含的断言（窗口启动、回环就绪、同源导航、`window.open` 策略）就是目标契约。

macOS CI 通道 `desktop-macos` 运行生命周期冒烟测试与 `pack:desktop:mac`，并通过 `all-checks-passed.needs` 阻塞拉取请求结论，使交付的桌面产物无法静默回归。

## 已考虑的替代方案

**直接使用 Playwright `_electron`。** 未采用，因为 `Electron.launch` 硬编码 `--remote-debugging-port=0`，而 Electron 40 到 43（均基于 Node 24）都会以 `bad option` 拒绝该标志，驱动无法启动任何当前 Electron。

**降级 Electron 到仍接受 `--remote-debugging-port` 的版本。** 在实测 Electron 40、41、42、43 后未采用：四个版本都拒绝该标志。最早接受该标志的版本早于 Node 24（Electron 39），较已交付的 43 降级四个大版本。

**改为通过原生 CDP 驱动渲染进程，而非 Playwright。** 暂未采用：它重新实现了 Playwright 已拥有的能力，且同样受限于相同的 remote-debugging 移除。

## 后果

桌面的 spawn/ready/stop 路径得到持续覆盖，但在 Playwright 推出兼容 Electron 43 的启动方式之前，Electron GUI shell（窗口启动与集成的导航策略执行）不会被自动化覆盖；届时 `desktop.e2e.ts` 中的 `describe.skip` 是唯一需要移除的位置。`--expose-internals`/`ELECTRON_RUN_AS_NODE` 契约已文档化并由单元测试固定，因此任何改变 Node 内部 ESM loader 结构的 Electron 或 Node 升级都会显式失败而非静默失效。发布路径仍受上游 `npm-publish` 凭据门控，因此该 fork 只能演练 pack 而无法发布。
