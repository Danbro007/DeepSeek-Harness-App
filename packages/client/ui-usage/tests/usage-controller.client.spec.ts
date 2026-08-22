import { describe, expect, it, vi } from 'vitest'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'
import { PLATFORM_TOKEN_REF, UsageController } from '../src/client/usage-controller.ts'

function snapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    balance: null,
    usage: null,
    platformTokenConfigured: false,
    updatedAt: 1,
    notices: [],
    ...overrides,
  }
}

/** Build a controller around a fake credentials face and snapshot function. */
function makeController(options: {
  describe?: (refs: string[]) => unknown
  snapshot?: () => Promise<UsageSnapshot>
} = {}) {
  const describe = vi.fn(options.describe ?? (async () => ({
    result: { ok: true, value: { credentials: { [PLATFORM_TOKEN_REF]: { configured: true, writable: true } } } },
  })))
  const set = vi.fn(async () => ({ result: { ok: true, value: {} } }))
  const unset = vi.fn(async () => ({ result: { ok: true, value: {} } }))
  const api = { credentials: { describe, set, unset } }
  const snap = vi.fn(options.snapshot ?? (async () => snapshot()))
  const controller = new UsageController({
    api: api as never,
    snapshot: snap,
  })
  return { controller, describe, set, unset, snap }
}

describe('UsageController', () => {
  it('exposes the snapshot through the injected face', () => {
    const { controller } = makeController()
    const face = controller.inject()
    expect(typeof face.refresh).toBe('function')
    expect(typeof face.setToken).toBe('function')
    expect(typeof face.clearToken).toBe('function')
    expect(face.hooks.usage.getSnapshot().snapshot).toBeNull()
  })

  it('refresh loads the snapshot and the token state', async () => {
    const { controller, snap } = makeController({
      snapshot: async () => snapshot({ balance: { currency: 'USD', totalBalance: 1, grantedBalance: 0, toppedUpBalance: 1, isAvailable: true, source: 'api-key' } }),
    })
    await controller.refresh()
    const state = controller.inject().hooks.usage.getSnapshot()
    expect(snap).toHaveBeenCalledTimes(1)
    expect(state.loading).toBe(false)
    expect(state.tokenConfigured).toBe(true)
    expect(state.snapshot?.balance).toMatchObject({ totalBalance: 1 })
  })

  it('refresh records a snapshot failure as an error', async () => {
    const { controller } = makeController({ snapshot: async () => { throw new Error('boom') } })
    await controller.refresh()
    const state = controller.inject().hooks.usage.getSnapshot()
    expect(state.error).toBe('boom')
    expect(state.loading).toBe(false)
  })

  it('setToken writes the credential then refreshes', async () => {
    const { controller, set, snap } = makeController()
    await controller.setToken('new-token')
    expect(set).toHaveBeenCalledWith({ ref: PLATFORM_TOKEN_REF, value: 'new-token' })
    expect(snap).toHaveBeenCalled()
  })

  it('setToken skips the write for an empty value', async () => {
    const { controller, set } = makeController()
    await controller.setToken('')
    expect(set).not.toHaveBeenCalled()
  })

  it('clearToken removes the credential then refreshes', async () => {
    const { controller, unset, snap } = makeController()
    await controller.clearToken()
    expect(unset).toHaveBeenCalledWith({ ref: PLATFORM_TOKEN_REF })
    expect(snap).toHaveBeenCalled()
  })

  it('readCredential reports an unconfigured token', async () => {
    const { controller } = makeController({
      describe: async () => ({
        result: { ok: true, value: { credentials: { [PLATFORM_TOKEN_REF]: { configured: false, writable: true } } } },
      }),
    })
    await controller.refresh()
    expect(controller.inject().hooks.usage.getSnapshot().tokenConfigured).toBe(false)
  })

  it('readCredential keeps last state when the describe fails', async () => {
    const { controller } = makeController({ describe: async () => { throw new Error('down') } })
    await controller.refresh()
    expect(controller.inject().hooks.usage.getSnapshot().tokenConfigured).toBe(false)
  })

  it('readCredential keeps last state when the describe returns an error result', async () => {
    const { controller } = makeController({
      describe: async () => ({ result: { ok: false, error: { code: 'down', message: 'down', details: {} } } }),
    })
    await controller.refresh()
    expect(controller.inject().hooks.usage.getSnapshot().tokenConfigured).toBe(false)
  })

  it('records a non-Error snapshot failure as a generic message', async () => {
    const { controller } = makeController({ snapshot: async () => { throw 'boom-string' } })
    await controller.refresh()
    expect(controller.inject().hooks.usage.getSnapshot().error).toBe('读取失败')
  })

  it('refreshCredential re-reads the credential state', async () => {
    const { controller, describe } = makeController()
    controller.refreshCredential()
    await vi.waitFor(() => { expect(describe).toHaveBeenCalled() })
  })

  it('inject callbacks delegate to the controller methods', async () => {
    const { controller, snap, set, unset } = makeController()
    const face = controller.inject()
    await face.refresh()
    expect(snap).toHaveBeenCalled()
    await face.setToken('x')
    expect(set).toHaveBeenCalledWith({ ref: PLATFORM_TOKEN_REF, value: 'x' })
    await face.clearToken()
    expect(unset).toHaveBeenCalled()
  })

  it('treats a missing credential entry as unconfigured', async () => {
    const { controller } = makeController({
      describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
    })
    await controller.refresh()
    expect(controller.inject().hooks.usage.getSnapshot().tokenConfigured).toBe(false)
  })
})
