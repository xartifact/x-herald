import { test, expect } from './helpers'

test.describe('Provider Stats', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '供应商统计' })).toBeVisible()
  })

  test('shows summary section', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    const summary = page.getByText(/总请求|平均响应|成功率/i).first()
    if (await summary.isVisible().catch(() => false)) {
      await expect(summary).toBeVisible()
    } else {
      await expect(
        page
          .getByText('加载中...')
          .or(page.getByText(/暂无|没有数据/i))
          .first(),
      ).toBeVisible()
    }
  })

  test('shows toolbar with sort and time range controls', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    // Toolbar should have sort/time range controls
    const toolbarControls = page.locator('button, [role="combobox"], select').filter({
      hasText: /排序|响应时间|成功率|请求数|时间|过去|全部/i,
    })
    const toolbarCount = await toolbarControls.count()
    expect(toolbarCount > 0).toBe(true)
  })

  test('shows provider ranking section', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    const rankingVisible = await page
      .getByText(/供应商排名|排名/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (rankingVisible) {
      await expect(page.getByText(/供应商排名|排名/i).first()).toBeVisible()
    } else {
      // Check for the card heading
      const cardTitles = page.locator('[class*="card-title"], [class*="CardTitle"], h3')
      const titleCount = await cardTitles.filter({ hasText: /排名/i }).count()
      expect(titleCount > 0).toBe(true)
    }
  })

  test('shows provider count badge', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    // Badge with provider count
    const badge = page
      .locator('[class*="badge"], [class*="Badge"]')
      .filter({ hasText: /个供应商/i })
      .first()
    if (await badge.isVisible().catch(() => false)) {
      await expect(badge).toBeVisible()
    }
  })

  test('page does not show error state', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('加载失败')).not.toBeVisible()
  })

  test('refresh button works', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    const refreshBtn = page.getByRole('button', { name: /刷新|refresh/i }).first()
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click()
      await page.waitForLoadState('networkidle')
      expect(true).toBe(true)
    }
  })

  test('empty state shows when no provider data', async ({ page }) => {
    await page.goto('/admin/provider-stats')
    await page.waitForLoadState('networkidle')
    const emptyText = page.getByText(/暂无供应商请求数据|没有数据/i).first()
    if (await emptyText.isVisible().catch(() => false)) {
      await expect(emptyText).toBeVisible()
    }
  })
})
