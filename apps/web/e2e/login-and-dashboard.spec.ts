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
    // 侧边栏导航与仪表盘快捷卡片都指向相同路由；限定在 nav 内避免 strict-mode 多元素命中
    const nav = page.getByRole('navigation', { name: '管理导航' })
    await expect(nav.locator('a[href="/admin/providers"]')).toBeVisible()
    await expect(nav.locator('a[href="/admin/model-groups"]')).toBeVisible()
    await expect(nav.locator('a[href="/admin/keys"]')).toBeVisible()
  })

  test('navigates to providers page via link', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page
      .getByRole('navigation', { name: '管理导航' })
      .locator('a[href="/admin/providers"]')
      .click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '供应商管理' })).toBeVisible()
  })
})
