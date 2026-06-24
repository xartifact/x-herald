import { test, expect } from './helpers'

test.describe('Dashboard', () => {
  test('shows dashboard heading', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible()
  })

  test('shows resource count cards', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#provider-count')).toBeVisible()
    await expect(page.locator('#model-group-count')).toBeVisible()
    await expect(page.locator('#key-count')).toBeVisible()
  })

  test('navigation links are present', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('a[href="/admin/providers"]')).toBeVisible()
    await expect(page.locator('a[href="/admin/model-groups"]')).toBeVisible()
    await expect(page.locator('a[href="/admin/keys"]')).toBeVisible()
  })

  test('navigates to providers page via link', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.locator('a[href="/admin/providers"]').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '供应商管理' })).toBeVisible()
  })
})
