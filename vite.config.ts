import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-hook-form', '@hookform/resolvers/zod'],
  },
  resolve: {
    dedupe: ['@tanstack/react-query', 'react', 'react-dom'],
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
