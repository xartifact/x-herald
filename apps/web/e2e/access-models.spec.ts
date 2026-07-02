import { test, expect, uniqueName } from './helpers'

test.describe('Access Models', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '接入模型' })).toBeVisible()
  })

  test('empty state shows for search with no matches', async ({ page }) => {
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')
    await page.locator('input[placeholder="搜索接入模型..."]').fill('nonexistent-xyz-no-match')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的接入模型')).toBeVisible()
  })

  test('create a new access model', async ({ page }) => {
    const name = uniqueName('TestAM')
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')

    await page.locator('input[placeholder="my-gpt4"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()

    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
  })

  test('search functionality', async ({ page }) => {
    const name = uniqueName('TestAM')
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    await page.locator('input[placeholder="搜索接入模型..."]').fill(name)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(name)).toBeVisible()

    await page.locator('input[placeholder="搜索接入模型..."]').fill('nonexistent-xyz-123')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的接入模型')).toBeVisible()
  })

  test('edit an access model', async ({ page }) => {
    const originalName = uniqueName('TestAM')
    const newName = uniqueName('TestAM')
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(originalName)
    await page.getByRole('button', { name: '创建' }).click()
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 15000 })

    const row = page.locator('table tbody tr').filter({ hasText: originalName }).first()
    const actionButtons = row.locator('div.flex.justify-end.gap-2 button')
    await actionButtons.nth(0).click()

    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(newName)
    await page.getByRole('button', { name: '保存更改' }).click()

    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(newName)).toBeVisible({ timeout: 15000 })
  })

  test('delete an access model', async ({ page }) => {
    const name = uniqueName('TestAM')
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    const row = page.locator('table tbody tr').filter({ hasText: name }).first()
    const actionButtons = row.locator('div.flex.justify-end.gap-2 button')
    await actionButtons.nth(1).click()

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10000 })
  })

  test('toggle access model enabled/disabled', async ({ page }) => {
    const name = uniqueName('TestAM')
    await page.goto('/admin/access-models')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建接入模型' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="my-gpt4"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    const row = page.locator('table tbody tr').filter({ hasText: name }).first()
    await expect(row.getByText('启用')).toBeVisible()

    await row.locator('[role="switch"]').click()
    await page.waitForLoadState('networkidle')
    await expect(row.getByText('禁用')).toBeVisible({ timeout: 15000 })

    await row.locator('[role="switch"]').click()
    await page.waitForLoadState('networkidle')
    await expect(row.getByText('启用')).toBeVisible({ timeout: 15000 })
  })
})
