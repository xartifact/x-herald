import { test, expect } from './helpers'

test.describe('Logs', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '请求日志' })).toBeVisible()
  })

  test('shows search and filter controls', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('input[placeholder="搜索模型名称或虚拟密钥..."]')).toBeVisible()
    await expect(page.getByText('全部状态')).toBeVisible()
    await expect(page.getByText('全部客户端')).toBeVisible()
    await expect(page.getByText('全部时间')).toBeVisible()
  })

  test('shows history section', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('历史记录')).toBeVisible()
  })

  test('shows empty state when search has no matches', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('input[placeholder="搜索模型名称或虚拟密钥..."]').fill('nonexistent-model-xyz-123')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('没有找到匹配的日志记录')).toBeVisible()
  })

  test('page has table or empty state for logs', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    const hasTable = await page.locator('table').first().isVisible().catch(() => false)
    const hasEmptyState = await page.getByText('还没有请求日志').first().isVisible().catch(() => false)
    expect(hasTable || hasEmptyState).toBe(true)
  })

  test('cleanup dialog opens and shows form', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    const cleanupButton = page.getByRole('button', { name: /清理/ })
    if (await cleanupButton.isVisible().catch(() => false)) {
      await cleanupButton.click()
      await page.waitForSelector('[role="dialog"]')
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      await page.getByRole('button', { name: '取消' }).click()
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 }).catch(() => {})
    }
  })
})
