import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  build: { outDir: '/tmp/x-herald-design-preview', emptyOutDir: true },
})
