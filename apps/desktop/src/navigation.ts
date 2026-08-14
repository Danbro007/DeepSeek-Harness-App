/** Navigation policy for the desktop BrowserWindow. */

/** Whether a renderer navigation stays inside the supervised Harness origin. */
export function isHarnessNavigation(target: string, harnessUrl: string): boolean {
  try {
    return new URL(target).origin === new URL(harnessUrl).origin
  } catch {
    return false
  }
}

/** Whether a rejected renderer target may be opened by the system browser. */
export function isExternalWebUrl(target: string): boolean {
  try {
    const protocol = new URL(target).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
