# DeepSeek Harness App

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 macOS 桌面应用。它在经过安全加固的 Electron 窗口里封装 Harness 的 Web 应用，使会话、工具、审批、设置与插件组合与浏览器体验保持一致，并提供原生应用外壳。

## 下载

从 [Releases](https://github.com/Danbro007/DeepSeek-Harness-App/releases) 获取最新构建：下载 `DeepSeek-Harness-App-v0.1.0-macos-arm64.zip`，解压后将 `DeepSeek Harness App` 拖入“应用程序”。

> 当前构建仅作 adhoc 签名、未公证，首次打开时可能需要在“系统设置 → 隐私与安全性”中允许。

## 功能

- 基于 Harness Web profile 的原生 macOS 应用外壳
- 新建会话、工作区与真实模型交互
- Agent 预设与配置
- 会话内容搜索、归档查看与恢复
- 工具调用、轨迹与历史恢复

## 从源码运行

从仓库源码运行 Web UI：

```sh
git clone https://github.com/Danbro007/DeepSeek-Harness-App.git
cd DeepSeek-Harness-App
pnpm install
pnpm run build
pnpm dsh web
```

## 构建桌面应用

从源码构建未打包的 `.app`：

```sh
pnpm run pack:desktop:mac
```

生成的 `.app` 位于 `apps/desktop/dist/DeepSeek Harness App-darwin-arm64/` 下。

## 开发

- 桌面包装层：[apps/desktop/README.md](apps/desktop/README.md)
- Harness 架构：[docs/architecture.md](docs/architecture.md)
- 面向 agent：[AGENTS.md](AGENTS.md)

## 许可证

[MIT](LICENSE)
