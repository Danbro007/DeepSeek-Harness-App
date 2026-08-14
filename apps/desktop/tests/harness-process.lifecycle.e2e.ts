/**
 * Real-process smoke for the desktop harness lifecycle: spawns the Web profile
 * exactly as the Electron main process does, waits for loopback readiness, and
 * shuts it down. Exercises the spawn/ready/stop path that Playwright's Electron
 * driver cannot reach until it supports Electron 42+ flag surface.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HarnessProcess } from '../src/harness-process.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const DESKTOP_PATCH = fileURLToPath(new URL('../desktop.cordis.yml', import.meta.url))

describe('desktop Harness process lifecycle', () => {
  let cwd: string

  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-'))
  })

  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('spawns the Web profile and reaches loopback readiness', async () => {
    const harness = new HarnessProcess({
      executable: 'pnpm',
      commandPrefix: ['--dir', REPO_ROOT, 'dsh'],
      cwd,
      patchFiles: [DESKTOP_PATCH],
      startTimeoutMs: 90_000,
    })
    const url = await harness.start()
    try {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    } finally {
      await harness.stop()
    }
  }, 120_000)
})
