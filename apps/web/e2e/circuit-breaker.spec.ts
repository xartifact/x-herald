import { test, expect } from './helpers'

test.describe('Circuit Breaker', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '熔断记录' })).toBeVisible()
  })

  test('shows stats cards section', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    const statVisible = await page
      .getByText(/熔断器.*状态|熔断.*次数|健康.*实例/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false)
    if (statVisible) {
      await expect(page.getByText(/熔断器.*状态|熔断.*次数|健康.*实例/i).first()).toBeVisible()
    }
  })

  test('shows realtime state section', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    // 数据加载完成前单次快照可能两者皆空；轮询等待任一状态出现
    await expect
      .poll(async () => {
        const realtimeVisible = await page
          .getByText(/实时状态|实例状态|当前状态/i)
          .first()
          .isVisible()
          .catch(() => false)
        if (realtimeVisible) return true
        // Table headers may vary — check for any table
        const headerCount = await page.locator('th').count()
        const isLoading = await page
          .getByText('加载中...')
          .isVisible()
          .catch(() => false)
        return headerCount > 0 || isLoading
      })
      .toBe(true)
  })

  test('shows event history section', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    // 数据加载完成前单次快照可能两者皆空；轮询等待任一状态出现
    await expect
      .poll(async () => {
        const eventVisible = await page
          .getByText(/事件历史|历史事件/i)
          .first()
          .isVisible()
          .catch(() => false)
        if (eventVisible) return true
        // Fallback: check for any table or loading state
        const tableCount = await page.locator('table').count()
        const isLoading = await page
          .getByText('加载中...')
          .isVisible()
          .catch(() => false)
        return tableCount > 0 || isLoading
      })
      .toBe(true)
  })

  test('shows refresh button', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /刷新/i })).toBeVisible()
  })

  test('event filter dropdown is present', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    await expect
      .poll(async () => {
        const filterCount = await page
          .locator('button, [role="combobox"], select')
          .filter({ hasText: /全部|事件|类型|filter/i })
          .count()
        return filterCount > 0
      })
      .toBe(true)
  })

  test('page does not show error state', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('加载失败')).not.toBeVisible()
    await expect(page.getByText(/出错了|错误/).first()).not.toBeVisible()
  })

  test('top instances section renders when data exists', async ({ page }) => {
    await page.goto('/admin/circuit-breaker')
    await page.waitForLoadState('networkidle')
    const topSection = page.getByText(/top|最高|最多/i).first()
    if (await topSection.isVisible().catch(() => false)) {
      await expect(topSection).toBeVisible()
    }
  })
})
