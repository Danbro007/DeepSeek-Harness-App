/** Build a publishable dependency snapshot before Electron copies the app. */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { packager } from '@electron/packager'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const stage = mkdtempSync(join(tmpdir(), 'dsh-desktop-pack-'))
const electronVersion = createRequire(import.meta.url)('electron/package.json').version
const appName = 'DeepSeek Harness App'

try {
  const deployment = spawnSync(
    'pnpm',
    [
      '--config.inject-workspace-packages=true',
      '--config.node-linker=hoisted',
      '--filter', '@deepseek-ai/dsh-desktop',
      'deploy', '--prod', '--ignore-scripts', stage,
    ],
    { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, CI: 'true' } },
  )
  if (deployment.status !== 0) {
    throw new Error(`desktop pack: pnpm deploy failed with exit code ${String(deployment.status)}`)
  }
  const paths = await packager({
    dir: stage,
    name: appName,
    platform: 'darwin',
    arch: 'arm64',
    electronVersion,
    out: join(appDir, 'dist'),
    overwrite: true,
    // Profiles create module symlinks at runtime, so package resources must
    // remain real filesystem paths instead of entries inside an ASAR archive.
    asar: false,
    icon: join(stage, 'assets', 'icon.icns'),
    appBundleId: 'ai.deepseek.harness',
    appCategoryType: 'public.app-category.developer-tools',
    // Keep a product-owned resource name so LaunchServices does not reuse the
    // Electron template icon cache for this bundle.
    extendInfo: { CFBundleIconFile: 'AppIcon.icns' },
    prune: false,
    ignore: [
      /^\/(?:src|tests|scripts)(?:\/|$)/,
      /^\/(?:README(?:\.zh)?\.md|README\.i18n\.yaml|pnpm-(?:lock|workspace)\.yaml|tsconfig(?:\.tsbuildinfo|\.json)|tsdown\.config\.ts)$/,
    ],
  })
  const sourceIcon = readFileSync(join(stage, 'assets', 'icon.icns'))
  const packagedIcon = readFileSync(join(paths[0], `${appName}.app`, 'Contents', 'Resources', 'AppIcon.icns'))
  if (!sourceIcon.equals(packagedIcon)) {
    throw new Error('desktop pack: packaged application icon does not match assets/icon.icns')
  }
  console.log(`desktop pack: ${paths.join(', ')}`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
