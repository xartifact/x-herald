import { test, expect, uniqueName } from './helpers'

test.describe('Model Groups', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '模型组管理' })).toBeVisible()
  })

  test('empty state shows for search with no matches', async ({ page }) => {
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')
    await page.locator('input[placeholder="搜索模型组..."]').fill('nonexistent-xyz-no-match')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的模型组')).toBeVisible()
  })

  test('create a new model group', async ({ page }) => {
    const name = uniqueName('TestGroup')
    const displayName = uniqueName('TestGroupDisplay')
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '添加模型组' }).click()
    await page.waitForSelector('[role="dialog"]')

    await page.locator('input[placeholder="gpt-4"]').fill(name)
    await page.locator('input[placeholder="GPT-4"]').fill(displayName)
    await page.getByRole('button', { name: '创建' }).click()

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
  })

  test('search functionality', async ({ page }) => {
    const name = uniqueName('SearchGroup')
    const displayName = uniqueName('SearchGroupDisplay')
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加模型组' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="gpt-4"]').fill(name)
    await page.locator('input[placeholder="GPT-4"]').fill(displayName)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    await page.locator('input[placeholder="搜索模型组..."]').fill(name)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(name)).toBeVisible()

    await page.locator('input[placeholder="搜索模型组..."]').fill('nonexistent-xyz-123')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('没有找到匹配的模型组')).toBeVisible()
  })

  test('edit a model group', async ({ page }) => {
    const originalName = uniqueName('EditGroup')
    const originalDisplayName = uniqueName('EditGroupDisplay')
    const newName = uniqueName('EditedGroup')
    const newDisplayName = uniqueName('EditedGroupDisplay')
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加模型组' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="gpt-4"]').fill(originalName)
    await page.locator('input[placeholder="GPT-4"]').fill(originalDisplayName)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 15000 })

    const card = page.locator(`div.rounded-xl.border:has-text("${originalName}")`).first()
    const actionButtons = card.locator('div.flex.items-center.gap-2 button')
    await actionButtons.nth(0).click()

    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="gpt-4"]').fill(newName)
    await page.locator('input[placeholder="GPT-4"]').fill(newDisplayName)
    await page.getByRole('button', { name: '保存更改' }).click()
    await expect(page.getByText(newName)).toBeVisible({ timeout: 15000 })
  })

  test('delete a model group', async ({ page }) => {
    const name = uniqueName('DeleteGroup')
    const displayName = uniqueName('DeleteGroupDisplay')
    await page.goto('/admin/model-groups')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '添加模型组' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="gpt-4"]').fill(name)
    await page.locator('input[placeholder="GPT-4"]').fill(displayName)
    await page.getByRole('button', { name: '创建' }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())

    const card = page.locator(`div.rounded-xl.border:has-text("${name}")`).first()
    const actionButtons = card.locator('div.flex.items-center.gap-2 button')
    await actionButtons.nth(1).click()

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10000 })
  })
})
