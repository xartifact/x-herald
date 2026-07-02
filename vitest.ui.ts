import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@xartifact/x-llm-gateway-ui': path.resolve(__dirname, 'packages/ui/src'),
      '@xartifact/x-llm-gateway-shared': path.resolve(__dirname, 'packages/shared/src'),
      '@xartifact/x-llm-gateway-db': path.resolve(__dirname, 'packages/db/src'),
      '@xartifact/x-llm-gateway-core': path.resolve(__dirname, 'apps/gateway/src'),
    },
  },
  test: {
    include: ['**/*.ui.test.tsx', '**/*.ui.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./apps/gateway/src/test/ui-setup.ts'],
    globals: true,
    css: false,
  },
})