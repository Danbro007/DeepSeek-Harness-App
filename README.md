# DeepSeek Harness App

English | [中文](README.zh.md)

The macOS desktop application for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It wraps the Harness Web application in a hardened Electron window, so sessions, tools, approvals, settings, and plugin composition stay identical to the browser experience — behind a native app shell.

## Download

Get the latest build from [Releases](https://github.com/Danbro007/DeepSeek-Harness-App/releases): download `DeepSeek-Harness-App-v0.1.1-rc.2-macos-arm64.zip`, unzip, and drag `DeepSeek Harness App` into `Applications`.

> The build is ad-hoc signed and not notarized; on first launch macOS may require allowing it under **System Settings → Privacy & Security**.

## Features

- Native macOS app shell over the Harness Web profile
- Direct image input with the experimental `DeepSeek-V4-Flash-Vision-Exp` model
- DeepSeek usage and balance information in Settings
- New sessions, workspaces, and live model interaction
- Agent presets and configuration
- Conversation-content search, archive view, and restore
- Tool calls, trajectory, and history recovery
- App startup stays in the desktop window without opening a duplicate browser tab

## Run from source

<a id="run"></a>

To run the Web UI from a repository checkout:

```sh
git clone https://github.com/Danbro007/DeepSeek-Harness-App.git
cd DeepSeek-Harness-App
pnpm install
pnpm run build
pnpm dsh web
```

## Build the desktop app

Build the unpacked `.app`:

```sh
pnpm run pack:desktop:mac
```

The `.app` is written under `apps/desktop/dist/DeepSeek Harness App-darwin-arm64/`.

## Development

- Desktop wrapper: [apps/desktop/README.md](apps/desktop/README.md)
- Harness architecture: [docs/architecture.md](docs/architecture.md)
- For agents: [AGENTS.md](AGENTS.md)

## License

[MIT](LICENSE)
