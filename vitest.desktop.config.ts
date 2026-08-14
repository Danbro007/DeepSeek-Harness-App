import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

// Desktop lane: a real-process harness lifecycle smoke (spawn `dsh web`, wait
// for loopback readiness, shut down) plus the Playwright Electron shell test.
// The Electron shell test is skipped until Playwright drops the
// `--remote-debugging-port` flag that Electron 42+ removed; the lifecycle smoke
// exercises the spawn/ready/stop path independently. Runs on the macOS CI leg
// and locally.
export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.base.json'] }),
    standardDecoratorPlugin(),
  ],
  test: {
    execArgv: vitestExecArgv,
    include: ['apps/desktop/tests/**/*.e2e.ts'],
    // Electron boot plus the Web profile's loopback readiness take tens of
    // seconds; files share one app instance and run serially.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
