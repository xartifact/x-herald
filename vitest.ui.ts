import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.ui.test.tsx', '**/*.ui.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./apps/gateway/src/test/ui-setup.ts'],
    globals: true,
    css: false,
  },
})