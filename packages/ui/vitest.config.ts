import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@xartifact/x-herald-ui': path.resolve(__dirname, 'src'),
      '@xartifact/x-herald-shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
