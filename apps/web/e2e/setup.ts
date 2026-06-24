import { test as setup, expect } from '@playwright/test'

const authFile = 'e2e/.auth/admin.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input#password', 'test')
  await page.click('button[type="submit"]')
  await page.waitForURL('/admin')
  await page.waitForTimeout(500)

  await page.context().storageState({ path: authFile })
})
