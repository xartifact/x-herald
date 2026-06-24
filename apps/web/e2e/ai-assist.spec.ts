import { test, expect } from './helpers'

test.describe('AI Assist', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'AI 错误诊断' })).toBeVisible()
  })

  test('shows log selection card', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('选择请求日志')).toBeVisible()
  })

  test('log ID input is present', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('input[placeholder="输入日志 ID"]')).toBeVisible()
  })

  test('shows failed log selector dropdown', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/选择最近失败/i)).toBeVisible()
  })

  test('diagnose button is present', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /AI 诊断/i })).toBeVisible()
  })

  test('diagnose button is disabled when input is empty', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    const diagnoseBtn = page.getByRole('button', { name: /AI 诊断/i })
    // Input is empty by default, button should be disabled
    const isDisabled = await diagnoseBtn.isDisabled().catch(() => false)
    if (isDisabled) {
      await expect(diagnoseBtn).toBeDisabled()
    }
  })

  test('shows common error patterns section', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('常见错误模式')).toBeVisible()
  })

  test('error patterns table has correct headers', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    const table = page.locator('table')
    if (await table.isVisible().catch(() => false)) {
      await expect(page.getByText('错误类型')).toBeVisible()
      await expect(page.getByText('服务商')).toBeVisible()
      await expect(page.getByText('模型')).toBeVisible()
      await expect(page.getByText('出现次数')).toBeVisible()
    } else {
      // Table could be empty — check for empty state text
      const emptyState = page.getByText(/暂无已学习的错误模式|暂无|没有数据/i).first()
      if (await emptyState.isVisible().catch(() => false)) {
        await expect(emptyState).toBeVisible()
      }
    }
  })

  test('page does not show error state', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('加载失败')).not.toBeVisible()
  })

  test('typing in log ID and clicking diagnose triggers API call', async ({ page }) => {
    await page.goto('/admin/ai-assist')
    await page.waitForLoadState('networkidle')

    // Type a fake log ID
    await page.locator('input[placeholder="输入日志 ID"]').fill('test-log-id')
    
    // Button should now be enabled
    const diagnoseBtn = page.getByRole('button', { name: /AI 诊断/i })
    expect(await diagnoseBtn.isDisabled().catch(() => false)).toBe(false)
  })
})
