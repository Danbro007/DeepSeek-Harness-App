/** What the browser half registers, and that it leaves with the fiber. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'
import { apply, inject, unwrapUsageResult } from '../src/client/index.ts'

// This thread-safe lane has no browser-language initialization, so the bench
// selects the shipped Chinese copy explicitly.

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const remote = new TestRemote(ctx)
  const snapshot = vi.fn(async () => ({ ok: true as const, value: usageSnapshot() }))
  ;(remote as unknown as { usage: { snapshot: typeof snapshot } }).usage = { snapshot }
  const describe = vi.fn(() => Promise.resolve({ result: { ok: false, error: {} } }))
  ctx.provide('connection', {
    isLoopback: true,
    api: { credentials: { describe } },
  } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, remote, snapshot, describe }
}

function usageSnapshot(): UsageSnapshot {
  return {
    balance: null,
    usage: null,
    platformTokenConfigured: false,
    updatedAt: 1,
    notices: [],
  }
}

describe('ui-usage apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote'])
  })

  it('registers one Usage section in the settings root', async () => {
    const { ctx, slots } = await bench()
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    expect(section.options).toMatchObject({ id: 'usage', order: 30 })
    expect(resolveSlotLabel(section.options.label)).toBe('用量')
  })

  it('withdraws the section when the plugin fiber disposes', async () => {
    const { ctx, slots } = await bench()
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
    expect(slots.entries('settings.section')).toHaveLength(1)

    await fiber.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })

  it('injects a refresh that reads the usage snapshot', async () => {
    const { ctx, slots, snapshot } = await bench()
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    const section = slots.entries('settings.section')[0]!
    const face = (section as unknown as { inject: () => { refresh: () => Promise<void> } }).inject()
    await face.refresh()
    expect(snapshot).toHaveBeenCalled()
  })

  it('re-reads the credential when the platform token changes', async () => {
    const { ctx, slots, remote, describe } = await bench()
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    remote.$dispatch('credentials/reference-updated', ['DEEPSEEK_PLATFORM_TOKEN'])
    await vi.waitFor(() => { expect(describe).toHaveBeenCalled() })
  })

  it('ignores credential updates for other references', async () => {
    const { ctx, slots, remote, describe } = await bench()
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    remote.$dispatch('credentials/reference-updated', ['SOME_OTHER_REF'])
    await vi.waitFor(() => { expect(describe).not.toHaveBeenCalled() })
  })
})

describe('unwrapUsageResult', () => {
  const snapshot: UsageSnapshot = {
    balance: null,
    usage: null,
    platformTokenConfigured: false,
    updatedAt: 1,
    notices: [],
  }

  it('returns the value on the ok branch', () => {
    expect(unwrapUsageResult({ ok: true, value: snapshot })).toBe(snapshot)
  })

  it('throws the Remote failure message on the error branch', () => {
    expect(() => unwrapUsageResult({
      ok: false,
      error: { code: 'service-unavailable', message: 'boom', details: {} },
    })).toThrow('boom')
  })
})
