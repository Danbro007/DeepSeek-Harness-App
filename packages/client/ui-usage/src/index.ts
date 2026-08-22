/**
 * Node half of the Usage settings surface. The browser half carries all
 * behavior; this half only exists so the Loader can import the package's node
 * entry as an ordinary (empty) host row before serving `lib/client.js`.
 * @module @deepseek-ai/dsh-client-ui-usage
 */

import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name. */
export const name = 'ui-usage'

/** No host-side service is required by the node half. */
export const inject: string[] = []

/** No-op node half. */
export function apply(_ctx: Context): void {}
