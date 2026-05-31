import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@x-llm-gateway/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@x-llm-gateway/engine': path.resolve(__dirname, '../../packages/engine/src'),
      '@x-llm-gateway/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
