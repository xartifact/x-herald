import { test, expect } from './helpers'

test.describe('Model Routes Page', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/model-routes')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '路由规则' })).toBeVisible()
  })

  test('page does not show loading spinner or error', async ({ page }) => {
    await page.goto('/admin/model-routes')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=加载中...')).not.toBeVisible()
    await expect(page.locator('text=加载失败')).not.toBeVisible()
  })

  test('page shows FlowEditor canvas', async ({ page }) => {
    await page.goto('/admin/model-routes')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.react-flow')).toBeVisible()
  })
})
