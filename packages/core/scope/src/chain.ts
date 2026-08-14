/**
 * Scope-key identity and chain infrastructure shared by the entry point and
 * the entry-table store. The store reads scope chains and the entry point
 * re-exports the store, so both depend on this module instead of each other.
 *
 * @module @deepseek-ai/dsh-scope
 */

import type { Context } from '@deepseek-ai/cordis'

/** An opaque, identity-compared scope key. */
export type ScopeKey = object

/** Context tag written by the scope mint. */
const kScope = Symbol('dsh.scope')

/**
 * The enclosing scope of each key. One relation powers both directions of
 * scope nesting: registration views inherit DOWN the chain, and event
 * admission extends UP it.
 */
const scopeParents = new WeakMap<ScopeKey, ScopeKey>()

/**
 * Read the nearest scope tag inherited by a context.
 * @param ctx - context to inspect.
 * @returns its scope key, or `undefined` for an unscoped context.
 */
export function scopeOf(ctx: Context): ScopeKey | undefined {
  return (ctx as Context & { [kScope]?: ScopeKey })[kScope]
}

/**
 * Tag a context with a scope key.
 * @param ctx - context to tag.
 * @param key - opaque scope identity.
 * @returns the tagged context.
 */
export function tagScopeContext(ctx: Context, key: ScopeKey): Context {
  return ctx.extend({ [kScope]: key })
}

/**
 * The chain from a key to its root ancestor.
 * @param key - the starting key, or `undefined` for the empty chain.
 * @returns keys nearest-first: `[key, parent, grandparent, …]`.
 */
export function scopeChainOf(key: ScopeKey | undefined): ScopeKey[] {
  const chain: ScopeKey[] = []
  for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) chain.push(cursor)
  return chain
}

/**
 * Read one key's enclosing scope.
 * @param key - the scope key to inspect.
 * @returns its parent key, or `undefined` for a root scope.
 */
export function scopeParentOf(key: ScopeKey): ScopeKey | undefined {
  return scopeParents.get(key)
}

/**
 * Cycle-checked write of one key's parent link.
 * @param key - the child scope key.
 * @param parent - its enclosing scope key.
 */
export function setScopeParent(key: ScopeKey, parent: ScopeKey): void {
  for (let cursor: ScopeKey | undefined = parent; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (cursor === key) throw new Error('dsh-scope: scope parent link would form a cycle')
  }
  scopeParents.set(key, parent)
}

/**
 * Test whether any ancestor in one key's chain satisfies a predicate.
 * @param key - the starting key, or `undefined` for an empty chain.
 * @param predicate - test applied to each ancestor, nearest-first.
 * @returns whether any ancestor matched.
 */
export function anyScopeAncestor(key: ScopeKey | undefined, predicate: (ancestor: ScopeKey) => boolean): boolean {
  for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (predicate(cursor)) return true
  }
  return false
}
