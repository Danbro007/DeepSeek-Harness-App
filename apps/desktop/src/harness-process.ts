/** Lifecycle owner for the loopback Web profile embedded by the desktop application. */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

const READY_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)(?: \(LAN: .+\))?$/
const DEFAULT_START_TIMEOUT_MS = 30_000
const DEFAULT_STOP_TIMEOUT_MS = 8_000
const MAX_DIAGNOSTIC_LINES = 40

/** Runtime values used to launch the Harness child process. */
export interface HarnessProcessOptions {
  /** Electron executable used in Node mode for the packaged CLI. */
  executable: string
  /** Working directory inherited by new Harness sessions. */
  cwd: string
  /** Optional CLI entry override for tests and development diagnostics. */
  cliEntry?: string
  /** Arguments placed before the `web` profile invocation. */
  commandPrefix?: string[]
  /** Launcher patch overlays applied before Web application arguments. */
  patchFiles?: string[]
  /**
   * Run the executable as Electron's bundled Node runtime (`ELECTRON_RUN_AS_NODE`).
   * When true, the CLI is launched with `--expose-internals`: the Cordis loader
   * must reach Node's internal ESM loader (`internal/modules/esm/loader`), and
   * its native-addon fallback (`node-addon-require-builtin`) is ABI-incompatible
   * with Electron's Node runtime. This is a pinned contract — an Electron or
   * Node upgrade that reshapes the internal loader breaks packaged startup.
   */
  runAsNode?: boolean
  /** Additional environment values merged over the current process. */
  env?: NodeJS.ProcessEnv
  /** Maximum wait for the Web readiness line. */
  startTimeoutMs?: number
  /** Grace period between SIGTERM and SIGKILL. */
  stopTimeoutMs?: number
}

/** Build the launcher/profile arguments without crossing the app-argument split. */
export function harnessArguments(commandPrefix: readonly string[], patchFiles: readonly string[] = []): string[] {
  return [
    ...commandPrefix,
    'web',
    ...patchFiles.flatMap(path => ['--patch', path]),
    '--port', '0',
    '--no-open',
  ]
}

/** Extract the canonical loopback URL from one complete CLI output line. */
export function parseHarnessReadyUrl(line: string): string | undefined {
  return READY_LINE.exec(line.trim())?.[1]
}

/** Resolve the desktop launch directory without relying on Finder's process cwd. */
export function resolveDesktopCwd(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_DESKTOP_CWD?.trim()
  return configured === undefined || configured === '' ? homedir() : resolve(configured)
}

/** Resolve the built dsh CLI from the desktop package's production dependency. */
function resolveDshCliEntry(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')
}

/**
 * Resolve the arguments that precede the `web` profile invocation. An explicit
 * `commandPrefix` wins; otherwise the CLI entry is derived, preceded by
 * `--expose-internals` when the process runs inside Electron's Node runtime
 * (see {@link HarnessProcessOptions.runAsNode}).
 */
export function resolveCommandPrefix(
  options: Pick<HarnessProcessOptions, 'commandPrefix' | 'runAsNode' | 'cliEntry'>,
): string[] {
  return options.commandPrefix ?? [
    ...(options.runAsNode === true ? ['--expose-internals'] : []),
    options.cliEntry ?? resolveDshCliEntry(),
  ]
}

/** Owns one child process from boot readiness through bounded shutdown. */
export class HarnessProcess {
  private child: ChildProcessByStdio<null, Readable, Readable> | undefined
  private stopping: Promise<void> | undefined

  constructor(private readonly options: HarnessProcessOptions) {}

  /** Start the Web profile on an OS-assigned loopback port. */
  async start(): Promise<string> {
    if (this.child !== undefined) throw new Error('desktop: Harness process already started')
    const commandPrefix = resolveCommandPrefix(this.options)
    const child = spawn(
      this.options.executable,
      harnessArguments(commandPrefix, this.options.patchFiles),
      {
        cwd: this.options.cwd,
        env: {
          ...process.env,
          ...this.options.env,
          ...(this.options.runAsNode === true ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    this.child = child
    const diagnostics: string[] = []
    const remember = (line: string): void => {
      if (line === '') return
      diagnostics.push(line)
      if (diagnostics.length > MAX_DIAGNOSTIC_LINES) diagnostics.shift()
    }
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) remember(line)
      process.stderr.write(chunk)
    })

    return await new Promise<string>((resolveReady, rejectReady) => {
      let stdoutBuffer = ''
      let settled = false
      const finish = (error: Error | undefined, url?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.off('error', onError)
        child.off('exit', onExit)
        if (error !== undefined) rejectReady(error)
        else resolveReady(url as string)
      }
      const failure = (message: string): Error => {
        const detail = diagnostics.length === 0 ? '' : `\n\n${diagnostics.join('\n')}`
        return new Error(`${message}${detail}`)
      }
      const onError = (error: Error): void => { finish(failure(`desktop: failed to start Harness: ${error.message}`)) }
      const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        this.child = undefined
        finish(failure(`desktop: Harness exited before readiness (code ${String(code)}, signal ${String(signal)})`))
      }
      const timer = setTimeout(() => {
        finish(failure('desktop: Harness did not become ready before the startup timeout'))
        void this.stop()
      }, this.options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS)

      child.once('error', onError)
      child.once('exit', onExit)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        process.stdout.write(chunk)
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          remember(line)
          const url = parseHarnessReadyUrl(line)
          if (url !== undefined) finish(undefined, url)
        }
      })
    })
  }

  /** Stop the Harness process, escalating only after its graceful deadline. */
  stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping
    const child = this.child
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    this.stopping = new Promise<void>((resolveStopped) => {
      const finish = (): void => {
        clearTimeout(timer)
        this.child = undefined
        resolveStopped()
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS)
      child.once('exit', finish)
      if (!child.kill('SIGTERM')) finish()
    }).finally(() => { this.stopping = undefined })
    return this.stopping
  }
}
