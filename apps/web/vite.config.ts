import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'


export default defineConfig({
  plugins: [react()],
  optimizeDeps: { force: true },
  define: {
    global: 'globalThis',
    'process.env': JSON.stringify({NODE_ENV:"development",LOG_LEVEL:"info",LOG_ENABLE_DEBUG:"false",LOG_ENABLE_REQUEST:"false"}),
  },
  resolve: {
    dedupe: ['@tanstack/react-query', 'react', 'react-dom'],
    alias: {
      '@xartifact/x-llm-gateway-shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@xartifact/x-llm-gateway-ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
