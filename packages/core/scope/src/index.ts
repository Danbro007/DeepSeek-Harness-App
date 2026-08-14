/**
 * Scoped-context primitive: mint a Cordis context that tags registrations with
 * an opaque identity and build routing-only event carriers for that identity.
 *
 * @module @deepseek-ai/dsh-scope
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import { Context as CordisContext } from '@deepseek-ai/cordis'
import {
  anyScopeAncestor, scopeOf, scopeParentOf, setScopeParent, tagScopeContext, type ScopeKey,
} from './chain.ts'

export { scopeChainOf, scopeOf, scopeParentOf, type ScopeKey } from './chain.ts'
export { AnonymousEntries, NamedEntries, ScopedLayers } from './store.ts'
export type { ScopeLayer } from './store.ts'

declare const ScopedBrand: unique symbol

/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
export type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }

/** The key associated with each carrier. Presence distinguishes an unkeyed carrier from a non-carrier. */
const carrierKeys = new WeakMap<object, ScopeKey | undefined>()

/** The privileged handle to move one scope key's parent link. */
export interface ScopeParentBinding {
  /**
   * Re-link the bound key to a different parent, with the same cycle check as
   * the bind. Valid only while nothing produced under the old parent is
   * retained — the blank-session recompose contract, which the holder upholds
   * because this relation cannot see what a session logged.
   * @param parent - the new enclosing scope key.
   */
  rebind(parent: ScopeKey): void
}

/**
 * Bind `parent` as `key`'s enclosing scope, once.
 *
 * A key that already has a parent throws: there is no open re-link path, so a
 * scope's ancestry cannot be moved by anyone but the original binder, who
 * alone receives the {@link ScopeParentBinding}. A link that would close a
 * cycle is rejected, because every chain consumer walks parents to the root.
 * @param key - the child scope key.
 * @param parent - its enclosing scope key.
 * @returns the binding that alone may re-link this key.
 */
export function bindScopeParent(key: ScopeKey, parent: ScopeKey): ScopeParentBinding {
  if (scopeParentOf(key) !== undefined) {
    throw new Error('dsh-scope: scope key is already bound to a parent; re-linking requires the binding returned by the original bind')
  }
  setScopeParent(key, parent)
  return {
    rebind(next: ScopeKey): void {
      setScopeParent(key, next)
    },
  }
}

/** A minted registration scope and its quiescent disposal boundaries. */
export interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}

/** Follow a Cordis fiber through asynchronous teardown even if its raw disposer was already claimed. */
async function quiesceFiber(fiber: Fiber): Promise<void> {
  await Promise.resolve(fiber.dispose())
  while (fiber.inertia !== undefined) await fiber.inertia
}

/** Shared no-op plugin used as the backing scope fiber. */
function scope(): void {}

/** Options accepted by {@link createScope}. */
export interface CreateScopeOptions {
  /** Enclosing scope bound via {@link bindScopeParent} before the scope is usable; the binding stays internal. */
  parent?: ScopeKey
}

/**
 * Mint a scope under `ctx`. The scoped context inherits the minting plugin's
 * dependency API and owns every registration made through it.
 * @param ctx - active context whose dependency API the scope inherits.
 * @param key - opaque identity used for listener routing.
 * @param options - optional scope-chain placement.
 * @returns the scoped context and exact/shared disposal boundaries.
 */
export function createScope(ctx: Context, key: ScopeKey, options?: CreateScopeOptions): Scope {
  if (options?.parent !== undefined) setScopeParent(key, options.parent)
  const fiber = ctx.plugin(scope)
  const scoped: Context = tagScopeContext(fiber.ctx, key)
  let disposing: Promise<void> | undefined
  return {
    ctx: scoped,
    rawDispose: fiber.dispose,
    dispose: () => (disposing ??= quiesceFiber(fiber)),
  }
}

/**
 * Build an opaque receiver that preserves the base filter, admits untagged
 * listeners globally, and admits tagged listeners for a matching key or any
 * of its ancestors ({@link bindScopeParent}): a listener owned by an enclosing
 * scope receives every descendant scope's events, which is what lets one
 * standing composition observe each of the agents composed under it. A tag
 * BELOW the dispatch key stays excluded — events flow up the chain, never
 * down.
 * @param base - subject or service whose existing Cordis filter is preserved.
 * @param key - routed scope identity, or `undefined` for an unscoped subject.
 * @returns a carrier whose subject remains available only through event arguments.
 */
export function scopeTarget<T extends object>(base: T, key: ScopeKey | undefined): Scoped<T> {
  const baseFilter = (base as { [CordisContext.filter]?: (ctx: Context) => boolean })[CordisContext.filter]
  const carrier = {
    [CordisContext.filter](ctx: Context): boolean {
      if (baseFilter !== undefined && !baseFilter.call(base, ctx)) return false
      const tag = scopeOf(ctx)
      if (tag === undefined) return true
      return anyScopeAncestor(key, cursor => cursor === tag)
    },
  }
  carrierKeys.set(carrier, key)
  return carrier as unknown as Scoped<T>
}

/**
 * Test whether a value is a scope carrier.
 * @param value - dispatch receiver to inspect.
 * @returns whether {@link scopeTarget} created it.
 */
export function isScopeCarrier(value: unknown): value is Scoped<object> {
  return typeof value === 'object' && value !== null && carrierKeys.has(value)
}

/**
 * Read a carrier's routing key.
 * @param value - dispatch receiver to inspect.
 * @returns the carrier key, or `undefined` for an unkeyed/non-carrier value.
 */
export function carrierKeyOf(value: unknown): ScopeKey | undefined {
  if (!isScopeCarrier(value)) return undefined
  return carrierKeys.get(value)
}
