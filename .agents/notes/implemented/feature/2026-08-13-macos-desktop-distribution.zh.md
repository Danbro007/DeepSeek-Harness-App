# Agent Note: 基于 Web profile 的 macOS 桌面发行版

Status: implemented

[English](2026-08-13-macos-desktop-distribution.md) | 中文

## 问题

DeepSeek Harness 已在 Web profile 中提供完整 GUI，但还没有可安装的 macOS 应用。重新实现该 UI 会产生独立的行为、样式和发布生命周期，而预留的 Electron IPC 载体所需的传输与组合改动远大于桌面发行版本身。

## 决策

`apps/desktop` 是现有 Web profile 之上的 Electron 发行包装层。其主进程以 `dsh web --port 0 --no-open` 启动随应用打包的 `@deepseek-ai/dsh` CLI，等待规范回环地址就绪行，然后在一个经过安全加固的 `BrowserWindow` 中加载该地址源。包装层负责承载就绪页面，因此启动时不会再把该 URL 交给系统浏览器。Web profile 仍是 GUI 组合和模型可见行为的唯一所有者。

包装层将 Harness 进程作为一项自有资源。启动过程有就绪等待上限，并保留最近的子进程诊断。退出时先发送 SIGTERM，让 Cordis tree 完成 dispose（资源释放），再在宽限期结束后发送 SIGKILL。渲染进程导航限制在分配的地址源内；外部 HTTP 和 HTTPS 链接通过 macOS 打开，其他协议会被拒绝。

从 Finder 启动时使用用户主目录作为初始工作区。`DSH_DESKTOP_CWD` 是显式部署覆盖项。Harness 仍负责其现有主目录、凭证、设置、持久化、沙箱和审批策略。

可部署包显式提供组装后 Web profile 所需的运行时 peer provider。打包后的子进程通过 `--expose-internals` 运行 Electron 内置 Node，以保留常规 CLI 使用的 loader 和 HMR 服务。资源保持非归档状态，因为 profile 模块 fallback 会创建指向已安装插件目录的文件系统符号链接。

桌面子进程额外应用发行版持有的 patch，在首次搜索时打开 SQLite 会话查询 provider。共享 Web profile 保持现有部署默认值，而安装后的应用保证可搜索对话正文。应用图标从一份居中的矢量源生成完整 macOS iconset 后再参与打包。

该包装层不实现预留的无端口 IPC 载体。后者仍是独立应用传输，可以在不改变客户端协议类型和 React UI 的前提下替换 Web 子服务器。

## 验证

单元测试固定就绪行解析、桌面 patch 参数、cwd 选择、同源导航和外链协议过滤。macOS 打包检查必须生成可启动且 `CFBundleIconFile` 能解析到所生成 `.icns` 的 `.app`；冒烟测试使用空的临时 `DSH_HOME` 启动打包后的可执行文件，等待其回环地址就绪行，并获取 Web shell 标题。集成测试通道——真实进程的 harness 生命周期冒烟测试与被跳过的 Playwright Electron shell 测试——由[桌面 Electron 集成测试](../testing/2026-08-14-desktop-electron-integration-testing.zh.md) Agent Note 负责。

## 已考虑的替代方案

**将 Web UI 复制到桌面专用渲染进程。** 未采用，因为每项客户端功能、样式改动和插件名单更新都需要两套实现，无法继续保持一比一。

**先实现 IPC 载体再交付桌面应用。** 此发行版未采用，因为它会把改动扩展到模块交付、单次和流式承载、通用 Connection RPC、下载以及独立桌面 profile。协议保留了该路径，但可安装包装层不以它为前提。

**加载固定 Web 端口。** 未采用，因为并发 Harness 进程和遗留监听器会发生冲突。端口零让 OS 分配未使用的回环端口，而 CLI 就绪行是向窗口交接该地址的唯一方式。

## 后果

桌面应用与 Web 功能及视觉完全一致，只增加一个小型应用层生命周期所有者。其代价是保留回环 HTTP 监听器和子进程、使用 Web 界面的模型上下文，并依赖打包后的 CLI 依赖闭包。代码签名、公证、自动更新和无端口 IPC 传输不属于该发行版。
