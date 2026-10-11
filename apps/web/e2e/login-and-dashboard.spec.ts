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

  test('updates browser title during client-side navigation', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('x-herald · 控制台')

    await page
      .getByRole('navigation', { name: '管理导航' })
      .locator('a[href="/admin/providers"]')
      .click()
    await expect(page.getByRole('heading', { name: '供应商管理' })).toBeVisible()
    await expect(page).toHaveTitle('x-herald · 供应商')
  })
  test('route overview canvas follows light/dark theme changes', async ({ page }) => {
    const modelName = `ThemeFlow-${Date.now()}`
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(modelName)
    await page.getByRole('button', { name: '创建' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' })

    await page.goto('/admin/route-overview')
    await page.waitForLoadState('networkidle')

    const flow = page.locator('.react-flow')
    await expect(flow).toBeVisible()

    await page.getByRole('button', { name: '选择明暗模式' }).click()
    await page.getByRole('menuitem', { name: '深色' }).click()
    await expect(flow).toHaveClass(/dark/)

    await page.getByRole('button', { name: '选择明暗模式' }).click()
    await page.getByRole('menuitem', { name: '浅色' }).click()
    await expect(flow).not.toHaveClass(/dark/)
  })
})
