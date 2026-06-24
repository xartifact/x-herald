import { test, expect, uniqueName } from './helpers'

test.describe('Providers', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '供应商管理' })).toBeVisible()
  })

  test('empty state shows for search with no matches', async ({ page }) => {
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')
    await page.locator('input[placeholder="搜索供应商..."]').fill('nonexistent-xyz-no-match')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的供应商')).toBeVisible()
  })

  test('create a new provider', async ({ page }) => {
    const name = uniqueName('TestProvider')
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '添加供应商' }).click()
    await page.waitForSelector('[role="dialog"]')

    await page.locator('input[placeholder="X-AIO API"]').fill(name)
    // Ensure the OpenAI checkbox is checked (it should be by default but verify)
    const openaiCheckbox = page.locator('[role="dialog"] [role="checkbox"]').first()
    if (!(await openaiCheckbox.isChecked())) {
      await openaiCheckbox.check()
    }
    await page.getByRole('button', { name: '创建' }).click()

    // Wait for dialog to close (or check for success)
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
  })

  test('search functionality', async ({ page }) => {
    const name = uniqueName('SearchProvider')
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加供应商' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    await page.locator('input[placeholder="搜索供应商..."]').fill(name)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(name)).toBeVisible()

    await page.locator('input[placeholder="搜索供应商..."]').fill('nonexistent-xyz-123')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的供应商')).toBeVisible()
  })

  test('edit provider', async ({ page }) => {
    const originalName = uniqueName('EditProvider')
    const newName = uniqueName('EditedProvider')
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加供应商' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(originalName)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 15000 })

    const card = page.locator(`div.rounded-xl.border:has-text("${originalName}")`).first()
    const actionButtons = card.locator('div.flex.items-center.gap-1 button')
    await actionButtons.nth(2).click()

    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(newName)
    await page.getByRole('button', { name: '保存更改' }).click()
    await expect(page.getByText(newName)).toBeVisible({ timeout: 15000 })
  })

  test('delete provider', async ({ page }) => {
    const name = uniqueName('DeleteProvider')
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加供应商' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())

    const card = page.locator(`div.rounded-xl.border:has-text("${name}")`).first()
    const actionButtons = card.locator('div.flex.items-center.gap-1 button')
    await actionButtons.nth(3).click()

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10000 })
  })

  test('toggle provider enabled/disabled', async ({ page }) => {
    const name = uniqueName('ToggleProvider')
    await page.goto('/admin/providers')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加供应商' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(name)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    const card = page.locator(`div.rounded-xl.border:has-text("${name}")`).first()
    await card.getByText('启用').click()
    await page.waitForLoadState('networkidle')
    await expect(card.getByText('禁用')).toBeVisible()

    await card.getByText('禁用').click()
    await page.waitForLoadState('networkidle')
    await expect(card.getByText('启用')).toBeVisible()
  })
})
