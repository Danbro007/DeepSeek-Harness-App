/// <reference lib="dom" />
/**
 * Electron integration smoke for the desktop shell: boots the real application,
 * waits for the supervised Web profile to reach loopback readiness, and asserts
 * the navigation policy that keeps the window same-origin.
 *
 * Skipped until Playwright supports the Electron 42+ flag surface: Electron 42
 * and 43 removed the `--remote-debugging-port` command-line flag that Playwright
 * 1.61/1.62 hard-codes in `Electron.launch`, so `_electron.launch` exits with
 * `bad option: --remote-debugging-port`. Remove the skip once a Playwright
 * release drops that flag; the assertions themselves are the target contract.
 */
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))

describe.skip('desktop Electron shell', () => {
  let app: ElectronApplication
  let page: Page
  let origin: string

  beforeAll(async () => {
    app = await electron.launch({ args: [APP_DIR] })
    page = await app.firstWindow()
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+/, { timeout: 90_000 })
    origin = new URL(page.url()).origin
  }, 150_000)

  afterAll(async () => {
    await app?.close()
  })

  it('keeps in-window navigation inside the assigned loopback origin', async () => {
    await page.goto(`${origin}/`)
    expect(new URL(page.url()).origin).toBe(origin)

    await page.evaluate(() => { window.location.href = 'https://example.com' })
    await page.waitForTimeout(1_500)
    expect(new URL(page.url()).origin).toBe(origin)
  })

  it('denies window.open for non-Harness targets and keeps same-origin ones', async () => {
    expect(await page.evaluate(() => window.open('https://example.com'))).toBeNull()
    expect(await page.evaluate(() => window.open('file:///etc/passwd'))).toBeNull()
    expect(await page.evaluate(() => window.open('javascript:alert(1)'))).toBeNull()
    expect(await page.evaluate(u => window.open(u) !== null, `${origin}/`)).toBe(true)
  })
})
