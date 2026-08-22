import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject, name } from '../src/index.ts'

describe('ui-usage node half', () => {
  it('declares its name, empty injection, and a no-op apply', () => {
    expect(name).toBe('ui-usage')
    expect(inject).toEqual([])
    expect(() => { apply({} as Context) }).not.toThrow()
  })
})
