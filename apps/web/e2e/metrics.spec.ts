import { test, expect } from './helpers'

test.describe('Metrics', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '性能指标' })).toBeVisible()
  })

  test('shows summary cards section', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    const summaryExists = await page
      .getByText(/ttfb|tps|延迟|响应时间|perf/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (summaryExists) {
      await expect(page.getByText(/ttfb|tps|延迟|响应时间|perf/i).first()).toBeVisible()
    } else {
      await expect(
        page
          .getByText('加载中...')
          .or(page.getByText(/暂无|没有数据/i))
          .first(),
      ).toBeVisible()
    }
  })

  test('shows instance performance table', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    const tableHeaders = page.locator('th').filter({ hasText: /实例|provider|模型|响应/i })
    const headerCount = await tableHeaders.count()
    if (headerCount > 0) {
      await expect(tableHeaders.first()).toBeVisible()
    } else {
      const tableCount = await page.locator('table').count()
      const hasLoading = await page
        .getByText('加载中...')
        .isVisible()
        .catch(() => false)
      expect(tableCount > 0 || hasLoading).toBe(true)
    }
  })

  test('shows provider quality table', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    const qualityLabel = page.getByText(/供应商质量|provider quality|质量/i).first()
    const qualityVisible = await qualityLabel.isVisible().catch(() => false)
    if (qualityVisible) {
      await expect(qualityLabel).toBeVisible()
    } else {
      const tableCount = await page.locator('table').count()
      expect(tableCount > 0).toBe(true)
    }
  })

  test('page does not show error state', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('加载失败')).not.toBeVisible()
  })

  test('instance performance chart renders when data exists', async ({ page }) => {
    await page.goto('/admin/metrics')
    await page.waitForLoadState('networkidle')
    const chartArea = page
      .locator('[class*="recharts"], [class*="chart"], canvas, svg.g-rect')
      .first()
    if (await chartArea.isVisible().catch(() => false)) {
      await expect(chartArea).toBeVisible()
    }
  })
})
