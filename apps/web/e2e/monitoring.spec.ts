import { test, expect } from './helpers'

test.describe('Monitoring Pages', () => {
  test('logs page loads', async ({ page }) => {
    await page.goto('/admin/logs')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '请求日志' })).toBeVisible()
  })

  test('settings page loads', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible()
  })

  test('circuit-breaker page loads', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '熔断记录' })).toBeVisible()
  })

  test('access-models page loads', async ({ page }) => {
    await page.goto('/admin/access-models')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '接入模型' })).toBeVisible()
  })

  test('client-models page loads', async ({ page }) => {
    await page.goto('/admin/client-models')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '模型统计' })).toBeVisible()
  })

  test('provider-stats page loads', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '供应商统计' })).toBeVisible()
  })

  test('metrics page loads', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '性能指标' })).toBeVisible()
  })

  test('costs page loads', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: '费用统计' })).toBeVisible()
  })

  test('ai-assist page loads', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading').filter({ hasText: 'AI 错误诊断' })).toBeVisible()
  })
})
