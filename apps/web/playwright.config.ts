import { defineConfig, devices } from '@playwright/test'

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
      port: 3000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ADMIN_PASSWORD: 'test',
        JWT_SECRET: 'e2e-test-secret-key',
        DB_TYPE: 'pglite',
        MIGRATE_ON_BOOT: 'true',
        LOG_LEVEL: 'error',
        PORT: '3000',
        HOST: '127.0.0.1',
        CORS_ENABLED: 'true',
        CORS_ORIGINS: 'http://localhost:5173',
        NODE_ENV: 'development',
      },
    },
    {
      command: 'bun run dev',
      port: 5173,
      timeout: 15_000,
      reuseExistingServer: !process.env.CI,
    },
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
