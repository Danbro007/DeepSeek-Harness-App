import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  outDir: 'lib',
  clean: true,
  sourcemap: true,
  deps: { neverBundle: ['electron'] },
})
