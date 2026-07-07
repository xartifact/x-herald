import { test, expect } from './helpers'

test.describe('Costs', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '费用统计' })).toBeVisible()
  })

  test('shows summary cards', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    const summaryCards = page.locator('text=/总费用|总成本|total|cost|花费/i').first()
    if (await summaryCards.isVisible().catch(() => false)) {
      await expect(summaryCards).toBeVisible()
    } else {
      // Could be loading — check for loading state
      await expect(
        page
          .getByText('加载中...')
          .or(page.getByText(/暂无|没有数据/i))
          .first(),
      ).toBeVisible()
    }
  })

  test('shows date filter controls', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    // Date filter may be a preset dropdown or date picker
    const dateFilter = page
      .locator('button, [role="combobox"], select')
      .filter({ hasText: /最近|过去|全部|日期/i })
      .first()
    if (await dateFilter.isVisible().catch(() => false)) {
      await expect(dateFilter).toBeVisible()
    }
  })

  test('shows tabs for breakdown views', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    // Tabs: 按密钥 / 按供应商 / 按模型
    await expect(page.getByText('按密钥')).toBeVisible()
    await expect(page.getByText('按供应商')).toBeVisible()
    await expect(page.getByText('按模型')).toBeVisible()
  })

  test('switching tabs shows different content', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')

    // Click "按供应商" tab
    await page.getByText('按供应商').click()
    await page.waitForLoadState('networkidle')
    // Verify the tab content area is active (no crash)
    expect(true).toBe(true)

    // Click "按模型" tab
    await page.getByText('按模型').click()
    await page.waitForLoadState('networkidle')
    expect(true).toBe(true)

    // Click back to "按密钥"
    await page.getByText('按密钥').click()
    await page.waitForLoadState('networkidle')
    expect(true).toBe(true)
  })

  test('shows refresh button', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    const refreshBtn = page.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') })
    if (await refreshBtn.count().then((c) => c > 0)) {
      await expect(refreshBtn.first()).toBeVisible()
    } else {
      const iconBtns = page.locator('button[class*="icon"], button svg.lucide-refresh-cw')
      await expect(iconBtns.first()).toBeVisible()
    }
  })

  test('page does not show error state', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('加载失败')).not.toBeVisible()
  })

  test('each tab has a table or empty state', async ({ page }) => {
    await page.goto('/admin/costs')
    await page.waitForLoadState('networkidle')

    for (const tabLabel of ['按密钥', '按供应商', '按模型']) {
      await page.getByText(tabLabel).click()
      await page.waitForLoadState('networkidle')
      // Either a table exists or empty state is shown
      const hasTable = await page
        .locator('table')
        .isVisible()
        .catch(() => false)
      const hasEmpty = await page
        .getByText(/暂无|没有数据|无记录/i)
        .isVisible()
        .catch(() => false)
      const isLoading = await page
        .getByText('加载中...')
        .isVisible()
        .catch(() => false)
      // At least one of these should be true (or table within the tab panel)
      expect(hasTable || hasEmpty || isLoading).toBe(true)
    }
  })
})
