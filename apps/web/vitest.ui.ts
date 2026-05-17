import path from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Vitest 配置 — 仅用于 React 组件测试 (*.ui.test.tsx)
 * 
 * 后端单元测试使用 bun:test，不需要 vitest。
 * 此配置仅处理需要 DOM 环境的 React 组件测试。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.ui.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/ui-setup.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
