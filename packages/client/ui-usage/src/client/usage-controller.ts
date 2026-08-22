/**
 * Usage settings controller: bridges the `usage` Remote and the credentials
 * domain onto the section. The snapshot store is the one reactive face; the
 * component reads it through the injected `useUsage` hook and drives writes
 * through the injected callbacks, so no subscription machinery reaches React.
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'

/** Credential reference the platform session token is stored under. */
export const PLATFORM_TOKEN_REF = 'DEEPSEEK_PLATFORM_TOKEN'

/** What the Usage section renders. */
export interface UsageState {
  /** Latest snapshot, or null before the first read settles. */
  snapshot: UsageSnapshot | null
  /** Whether a refresh is in flight. */
  loading: boolean
  /** Whether the Host reports a platform token configured. */
  tokenConfigured: boolean
  /** Whether `credentials.set` can affect the token; false disables the control. */
  tokenWritable: boolean
  /** Last read failure message, or null. */
  error: string | null
}

/** Registration-side face the section's slot entry injects. */
export interface UsageFace {
  hooks: {
    /** Snapshot bound by the renderer as `useUsage`. */
    usage: SnapshotStore<UsageState>
  }
  refresh: () => Promise<void>
  setToken: (value: string) => Promise<void>
  clearToken: () => Promise<void>
}

/** Controller dependencies, supplied by the apply closure. */
export interface UsageControllerDeps {
  api: Pick<IApiClient, 'credentials'>
  snapshot: () => Promise<UsageSnapshot>
}

/** Owns the section's reactive state and its credential/snapshot reads. */
export class UsageController {
  private readonly store: SnapshotStore<UsageState>

  constructor(private readonly deps: UsageControllerDeps) {
    this.store = createSnapshotStore<UsageState>({
      snapshot: null,
      loading: false,
      tokenConfigured: false,
      tokenWritable: true,
      error: null,
    })
  }

  /** Re-read the platform token state and the usage snapshot. */
  async refresh(): Promise<void> {
    this.store.update((state) => { state.loading = true; state.error = null })
    const credentialRead = this.readCredential()
    try {
      const snapshot = await this.deps.snapshot()
      this.store.update((state) => { state.snapshot = snapshot; state.loading = false })
    } catch (error) {
      this.store.update((state) => {
        state.error = error instanceof Error ? error.message : '读取失败'
        state.loading = false
      })
    }
    await credentialRead
  }

  /**
   * Store the platform token, then re-read state and the usage snapshot.
   * @param value - New platform session token; an empty value performs no write.
   */
  async setToken(value: string): Promise<void> {
    if (value.length > 0) {
      try {
        await this.deps.api.credentials.set({ ref: PLATFORM_TOKEN_REF, value })
      } catch (_credentialWriteFailure) {
        // The re-read below reports whether the Host accepted the write.
      }
    }
    await this.refresh()
  }

  /** Remove the platform token, then re-read state and the usage snapshot. */
  async clearToken(): Promise<void> {
    try {
      await this.deps.api.credentials.unset({ ref: PLATFORM_TOKEN_REF })
    } catch (_credentialWriteFailure) {
      // The re-read below reports whether the Host accepted the removal.
    }
    await this.refresh()
  }

  /** Re-read after the Host reports a change to the platform-token reference. */
  refreshCredential(): void {
    void this.readCredential()
  }

  /**
   * Build the face the section's slot registration injects.
   * @returns Reactive state and credential actions for the Usage section.
   */
  inject(): UsageFace {
    return {
      hooks: { usage: this.store },
      refresh: () => this.refresh(),
      setToken: value => this.setToken(value),
      clearToken: () => this.clearToken(),
    }
  }

  private async readCredential(): Promise<void> {
    let view: { configured: boolean; writable: boolean } | undefined
    try {
      const response = await this.deps.api.credentials.describe({ refs: [PLATFORM_TOKEN_REF] })
      if (response.result.ok) {
        const entry = response.result.value.credentials[PLATFORM_TOKEN_REF]
        view = entry === undefined
          ? { configured: false, writable: true }
          : { configured: entry.configured, writable: entry.writable }
      }
    } catch (_credentialReadFailure) {
      // Keep the last known state; a write still reaches the Host.
      return
    }
    if (view === undefined) return
    this.store.update((state) => {
      state.tokenConfigured = view.configured
      state.tokenWritable = view.writable
    })
  }
}
