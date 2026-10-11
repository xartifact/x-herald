import { defineConfig, devices } from '@playwright/test'

// 本机 5173 可能被其他项目的 dev server 占用；E2E_WEB_PORT 允许换端口跑 e2e
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173)

// 必须与 vite.config.ts 的 /api 代理默认值一致（gateway 默认端口 43173）。
// 不一致时 vite 把 /api 转发到错误端口，登录等所有鉴权 E2E 全部 ECONNREFUSED 超时。
const gatewayPort = Number(process.env.E2E_GATEWAY_PORT ?? 43173)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'unauthenticated',
      testMatch: /login\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined,
      },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /login\.spec\.ts/],
    },
  ],

  webServer: [
    {
      command: 'cd ../../apps/gateway && bun run src/server.ts',
      port: gatewayPort,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ADMIN_PASSWORD: 'test',
        JWT_SECRET: 'e2e-test-secret-key',
        DB_TYPE: 'pglite',
        MIGRATE_ON_BOOT: 'true',
        LOG_LEVEL: 'error',
        PORT: String(gatewayPort),
        HOST: '127.0.0.1',
        CORS_ENABLED: 'true',
        CORS_ORIGINS: `http://localhost:${webPort}`,
        NODE_ENV: 'development',
      },
    },
    {
      command: `bun run dev -- --port ${webPort} --strictPort`,
      port: webPort,
      timeout: 15_000,
      reuseExistingServer: !process.env.CI,
    },
  ],

  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
