import { test, expect } from './helpers'

test.describe('Settings', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible()
  })

  test('shows config import export card', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('配置导入 / 导出')).toBeVisible()
  })

  test('shows export config button', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: '导出配置' })).toBeVisible()
  })

  test('shows import config button', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: '导入配置' })).toBeVisible()
  })

  test('export config triggers a download', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出配置' }).click(),
    ])

    expect(download).toBeTruthy()
  })

  test('shows AI model section', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('AI 功能模型')).toBeVisible()
  })

  test('shows circuit breaker section', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('熔断器配置')).toBeVisible()
  })
})
