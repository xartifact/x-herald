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
    await expect(page.getByText('没有找到匹配的结果')).toBeVisible()
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
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      .catch(() => {})
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
    await expect(page.getByText('没有找到匹配的结果')).toBeVisible()
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

    // 新版供应商列表：行内按钮展开 Sheet，编辑入口在 Sheet 中
    await page.getByRole('button', { name: `查看 ${originalName}` }).click()
    await page.getByRole('button', { name: '编辑连接' }).click()

    await page.waitForSelector('[role="dialog"]')
    await page.locator('input[placeholder="X-AIO API"]').fill(newName)
    await page.getByRole('button', { name: '保存更改' }).click()
    await expect(page.getByText(newName, { exact: true })).toBeVisible({ timeout: 15000 })
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

    page.on('dialog', (dialog) => dialog.accept())

    await page.getByRole('button', { name: `查看 ${name}` }).click()
    await page.getByRole('button', { name: '删除供应商' }).click()

    // Sheet 标题在删除完成前仍渲染名称；以列表行（查看按钮的可及名）为消失判据
    await expect(page.getByRole('button', { name: `查看 ${name}` })).not.toBeVisible({
      timeout: 10000,
    })
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

    // StatusToggle 在共享的列表容器内且全列表多行同名；按 aria-pressed 精确定位该行的开关
    const row = page.locator(`[aria-label="查看 ${name}"]`).locator('xpath=..')
    await row.getByRole('button', { pressed: true, name: '启用' }).click()
    await expect(row.getByRole('button', { pressed: false, name: '禁用' })).toBeVisible()

    await row.getByRole('button', { pressed: false, name: '禁用' }).click()
    await expect(row.getByRole('button', { pressed: true, name: '启用' })).toBeVisible()
  })
})
