/**
 * Usage settings surface, browser half: one `settings.section` page that
 * renders the DeepSeek balance and usage snapshot and owns the platform-token
 * credential control. Data comes from the `usage` Remote (mounted by
 * api-remotes); the token is written through the credentials domain and the
 * section refreshes on `credentials/reference-updated`.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the generated Remote API and ctx.remote merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'
import { UsageController, PLATFORM_TOKEN_REF } from './usage-controller.ts'
import { UsageSettingsSection } from './UsageSettingsSection.tsx'
import { en, zh } from './locales.ts'

export type { UsageFace, UsageState } from './usage-controller.ts'
export type { UsageSettingsSectionProps } from './UsageSettingsSection.tsx'

/**
 * Unwrap one `usage.snapshot` Remote result, throwing on the error branch so
 * the controller can surface it as a read failure.
 * @param result - the Remote result.
 * @returns the snapshot value.
 */
export function unwrapUsageResult(result: RemoteResult<UsageSnapshot>): UsageSnapshot {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Dictionary namespace owned by this plugin. */
const NS = 'usage'

/** Required services for the section, the Remote, and the credential control. */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the Usage settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-usage: dictionaries')

  const controller = new UsageController({
    api,
    snapshot: async () => unwrapUsageResult(await ctx.remote.usage.snapshot()),
  })

  // A token written elsewhere (or here) changes the platform-token credential
  // without touching a settings section, so re-read usage when it changes.
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref) => {
      if (ref === PLATFORM_TOKEN_REF) controller.refreshCredential()
    }),
    'ui-usage: credential invalidations',
  )

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: () => controller.inject(),
  }, UsageSettingsSection))
}
