# Agent Note: macOS desktop distribution over the Web profile

Status: implemented

English | [中文](2026-08-13-macos-desktop-distribution.zh.md)

## Problem

DeepSeek Harness has one complete GUI in the Web profile but no installable macOS application. Reimplementing that UI would create separate behavior, styling, and release lifecycles, while the reserved Electron IPC carrier requires a transport and composition change larger than a desktop distribution alone.

## Decision

`apps/desktop` is an Electron distribution wrapper over the existing Web profile. Its main process launches the packaged `@deepseek-ai/dsh` CLI as `dsh web --port 0 --no-open`, waits for the canonical loopback readiness line, and loads that origin in one hardened `BrowserWindow`. The wrapper owns the ready page, so startup does not also hand the URL to the system browser. The Web profile remains the sole owner of GUI composition and model-visible behavior.

The wrapper treats the Harness process as one owned resource. Startup has a bounded readiness wait and preserves recent child diagnostics. Quit sends SIGTERM so the Cordis tree can dispose, then sends SIGKILL after a bounded grace period. Renderer navigation remains on the assigned origin; external HTTP and HTTPS links open through macOS, and other schemes are denied.

Finder launches use the user's home directory as the initial workspace. `DSH_DESKTOP_CWD` is the explicit deployment override. Harness still owns its existing home, credentials, settings, persistence, sandbox, and approval policy.

The deployable package explicitly supplies runtime peer providers required by the assembled Web profile. The packaged child runs Electron's bundled Node with `--expose-internals`, which preserves the loader and HMR service used by the normal CLI. Resources remain unpacked because profile module fallbacks create filesystem symlinks to installed plugin directories.

The desktop child adds a distribution-owned patch that opens the SQLite session-query provider on first search. The shared Web profile keeps its existing deployment default, while the installed application guarantees conversation-content search. The application icon is generated from one centered vector source into the complete macOS iconset before packaging.

This wrapper does not implement the reserved port-free IPC carrier. That remains a separate application transport which can replace the child Web server without changing client protocol types or the React UI.

## Verification

Unit tests pin readiness-line parsing, desktop-patch arguments, cwd selection, same-origin navigation, and external-link scheme filtering. The macOS packaging check must produce a launchable `.app` whose `CFBundleIconFile` resolves to the generated `.icns`; a smoke with an empty temporary `DSH_HOME` starts the packaged executable, waits for its loopback readiness line, and fetches the Web shell title. The integrated test lane — the real-process harness lifecycle smoke and the skipped Playwright Electron shell test — is owned by the [desktop Electron integration testing](../testing/2026-08-14-desktop-electron-integration-testing.md) Agent Note.

## Alternatives considered

**Copy the Web UI into a desktop-only renderer.** Rejected because every client feature, style change, and plugin roster update would need two implementations and could no longer be one-to-one.

**Implement the IPC carrier before shipping a desktop application.** Rejected for this distribution because it expands the change into module delivery, unary and streaming carriage, generic Connection RPC, downloads, and a separate desktop profile. The protocol keeps that path available without making it a prerequisite for the installable wrapper.

**Load a fixed Web port.** Rejected because concurrent Harness processes and stale listeners would collide. Port zero lets the OS allocate an unused loopback port, and the CLI readiness line is the only handoff to the window.

## Consequences

The desktop application has exact Web feature and visual parity and adds only a small application-level lifecycle owner. It also retains a loopback HTTP listener and a child process, consumes the Web surface's model context, and needs the packaged CLI dependency closure. Code signing, notarization, automatic updates, and a port-free IPC transport remain outside this distribution.
