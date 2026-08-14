# Agent Note: desktop Electron integration testing over a real-process smoke

Status: implemented

English | [中文](2026-08-14-desktop-electron-integration-testing.zh.md)

## Problem

The macOS desktop distribution shipped with no automated coverage of its startup path: nothing proved the Electron main process could spawn the supervised Web profile and reach loopback readiness. Playwright's Electron driver could not fill that gap because it hard-codes the `--remote-debugging-port` flag, which Electron 40 and later (all Node 24 based) reject at process startup.

## Decision

`apps/desktop` gains a real-process harness lifecycle smoke (`tests/harness-process.lifecycle.e2e.ts`) that spawns `pnpm --dir <repo> dsh web --port 0` with the desktop patch exactly as the Electron main process does, waits for the canonical loopback readiness line, and shuts the child down. This covers the spawn → ready → stop path without a GUI.

The Playwright Electron shell test (`tests/desktop.e2e.ts`) is written but `describe.skip`ped. Remove the skip once a Playwright release drops the hard-coded `--remote-debugging-port` flag; the assertions it already carries (window boot, loopback readiness, same-origin navigation, `window.open` policy) are the target contract.

The macOS CI lane `desktop-macos` runs the lifecycle smoke and `pack:desktop:mac`, and blocks the pull-request verdict through `all-checks-passed.needs`, so the shipped desktop artifact cannot regress silently.

## Alternatives considered

**Playwright `_electron` today.** Rejected because `Electron.launch` hard-codes `--remote-debugging-port=0`, which Electron 40 through 43 (all Node 24 based) reject with `bad option`, so the driver cannot boot any current Electron.

**Downgrade Electron to a version that still accepts `--remote-debugging-port`.** Rejected after measuring Electron 40, 41, 42, and 43: all four reject the flag. The earliest accepting version predates Node 24 (Electron 39), a four-major downgrade from the shipped 43.

**Drive the renderer over raw CDP instead of Playwright.** Rejected for now: it reimplements what Playwright already owns and is still constrained by the same remote-debugging removal.

## Consequences

The desktop spawn/ready/stop path is continuously covered, but the Electron GUI shell (window boot plus integrated navigation-policy enforcement) is not automated until Playwright ships an Electron 43-compatible launch; `describe.skip` in `desktop.e2e.ts` is the single point to remove then. The `--expose-internals`/`ELECTRON_RUN_AS_NODE` contract is documented and pinned by a unit test, so an Electron or Node upgrade that reshapes Node's internal ESM loader fails loud rather than silently. The release publish path remains gated on upstream `npm-publish` credentials, so the fork can exercise pack but not publish.
