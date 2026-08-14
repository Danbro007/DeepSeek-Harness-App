import { describe, expect, it } from 'vitest'
import { harnessArguments, parseHarnessReadyUrl, resolveCommandPrefix, resolveDesktopCwd } from '../src/harness-process.ts'

describe('desktop Harness process helpers', () => {
  it('accepts only the canonical loopback readiness line', () => {
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:43125')).toBe('http://127.0.0.1:43125')
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:43125 (LAN: http://10.0.0.8:43125)'))
      .toBe('http://127.0.0.1:43125')
    expect(parseHarnessReadyUrl('dsh web: http://example.com:43125')).toBeUndefined()
    expect(parseHarnessReadyUrl('noise http://127.0.0.1:43125')).toBeUndefined()
  })

  it('uses an explicit desktop cwd when configured', () => {
    expect(resolveDesktopCwd({ DSH_DESKTOP_CWD: '/tmp/project' })).toBe('/tmp/project')
  })

  it('places desktop patches before Web application arguments', () => {
    expect(harnessArguments(['cli.js'], ['/app/desktop.cordis.yml'])).toEqual([
      'cli.js', 'web', '--patch', '/app/desktop.cordis.yml', '--port', '0',
    ])
  })

  it('adds --expose-internals only when running as Electron Node', () => {
    expect(resolveCommandPrefix({ runAsNode: true, cliEntry: 'cli.js' })).toEqual(['--expose-internals', 'cli.js'])
    expect(resolveCommandPrefix({ runAsNode: false, cliEntry: 'cli.js' })).toEqual(['cli.js'])
    expect(resolveCommandPrefix({ commandPrefix: ['explicit'], runAsNode: true, cliEntry: 'cli.js' }))
      .toEqual(['explicit'])
  })
})
