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
      '@xartifact/x-llm-gateway-ui': path.resolve(__dirname, 'src'),
      '@xartifact/x-llm-gateway-shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
