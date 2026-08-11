import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
      version?: string
    }
    return pkg.version ?? 'dev'
  } catch {
    return 'dev'
  }
}

function resolveCommitHash(): string {
  if (process.env.GIT_COMMIT_HASH) return process.env.GIT_COMMIT_HASH
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  optimizeDeps: { force: true },
  define: {
    global: 'globalThis',
    'process.env': JSON.stringify({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      LOG_ENABLE_DEBUG: 'false',
      LOG_ENABLE_REQUEST: 'false',
      APP_VERSION: resolveVersion(),
      GIT_COMMIT_HASH: resolveCommitHash(),
    }),
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
      '/api': process.env.GATEWAY_API_PROXY || 'http://localhost:3000',
    },
  },
  build: {
    chunkSizeWarningLimit: 10240,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        if (defaultHandler) defaultHandler(warning)
      },
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
          'tanstack-vendor': ['@tanstack/react-router', '@tanstack/react-query'],
        },
      },
    },
  },
})
