import { test, expect, uniqueName } from './helpers'

test.describe('Keys', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '密钥管理' })).toBeVisible()
  })

  test('empty state shows for search with no matches', async ({ page }) => {
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')
    await page.locator('input[placeholder="搜索密钥..."]').fill('nonexistent-xyz-no-match')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的密钥')).toBeVisible()
  })

  test('create a new key', async ({ page }) => {
    const name = uniqueName('TestKey')
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.waitForSelector('[role="dialog"]')

    await page.locator('input[placeholder="生产环境密钥"]').fill(name)
    await page.getByRole('button', { name: '创建密钥' }).click()

    // After creation, dialog may show the newly created key value
    // Close the dialog first to see the key in the table
    await page.getByRole('button', { name: '关闭' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
  })

  test('search functionality', async ({ page }) => {
    const name = uniqueName('SearchKey')
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="生产环境密钥"]').fill(name)
    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    await page.locator('input[placeholder="搜索密钥..."]').fill(name)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(name)).toBeVisible()

    await page.locator('input[placeholder="搜索密钥..."]').fill('nonexistent-xyz-123')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的密钥')).toBeVisible()
  })

  test('edit a key', async ({ page }) => {
    const originalName = uniqueName('EditKey')
    const newName = uniqueName('EditedKey')
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="生产环境密钥"]').fill(originalName)
    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 15000 })

    // Find the row with the original key name and click the edit button (Pencil icon)
    const row = page.locator('table tbody tr').filter({ hasText: originalName }).first()
    const actionButtons = row.locator('div.flex.justify-end.gap-2 button')
    await actionButtons.nth(2).click()

    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="生产环境密钥"]').fill(newName)
    await page.getByRole('button', { name: '保存更改' }).click()

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(newName)).toBeVisible({ timeout: 15000 })
  })

  test('delete a key', async ({ page }) => {
    const name = uniqueName('DeleteKey')
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="生产环境密钥"]').fill(name)
    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())

    // Find the row with the key name and click the delete button (Trash2 icon)
    const row = page.locator('table tbody tr').filter({ hasText: name }).first()
    const actionButtons = row.locator('div.flex.justify-end.gap-2 button')
    await actionButtons.nth(3).click()

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10000 })
  })

  test('toggle key enabled/disabled', async ({ page }) => {
    const name = uniqueName('ToggleKey')
    await page.goto('/admin/keys')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="生产环境密钥"]').fill(name)
    await page.getByRole('button', { name: '创建密钥' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    // Find the row and verify it's enabled
    const row = page.locator('table tbody tr').filter({ hasText: name }).first()
    await expect(row.getByText('启用')).toBeVisible()

    // Open edit dialog and toggle the enabled switch off
    const actionButtons = row.locator('div.flex.justify-end.gap-2 button')
    await actionButtons.nth(2).click()
    await page.waitForSelector('[role="dialog"]')
    const switchControl = page.getByLabel('启用密钥')
    await switchControl.click()
    await page.getByRole('button', { name: '保存更改' }).click()

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(row.getByText('禁用')).toBeVisible({ timeout: 15000 })

    // Toggle back to enabled
    await actionButtons.nth(2).click()
    await page.waitForSelector('[role="dialog"]')
    await switchControl.click()
    await page.getByRole('button', { name: '保存更改' }).click()

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(row.getByText('启用')).toBeVisible({ timeout: 15000 })
  })
})
