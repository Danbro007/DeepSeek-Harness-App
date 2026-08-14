import { describe, expect, it } from 'vitest'
import { isExternalWebUrl, isHarnessNavigation } from '../src/navigation.ts'

describe('desktop navigation policy', () => {
  const harnessUrl = 'http://127.0.0.1:43125'

  it('keeps only same-origin Harness pages inside the app', () => {
    expect(isHarnessNavigation('http://127.0.0.1:43125/session/one', harnessUrl)).toBe(true)
    expect(isHarnessNavigation('http://127.0.0.1:43126/session/one', harnessUrl)).toBe(false)
    expect(isHarnessNavigation('https://deepseek.com', harnessUrl)).toBe(false)
  })

  it('allows only HTTP links to leave through the system browser', () => {
    expect(isExternalWebUrl('https://deepseek.com')).toBe(true)
    expect(isExternalWebUrl('http://example.com')).toBe(true)
    expect(isExternalWebUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false)
  })
})
