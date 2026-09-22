import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '../../apps/web/app/**/*.ui.test.{ts,tsx}'],
    css: false,
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-hook-form', '@tanstack/react-query'],
    alias: {
      '@xartifact/x-herald-ui': path.resolve(__dirname, 'src'),
      '@xartifact/x-herald-shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
