import type { Page } from '@playwright/test'

import { test, expect, uniqueName } from './helpers'

async function createAccessModel(page: Page, name: string) {
  await page.goto('/admin/access-models')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: '创建接入模型' }).click()
  await page.waitForSelector('[role="dialog"]')
  await page.locator('input[placeholder="my-gpt4"]').fill(name)
  await page.getByRole('button', { name: '创建' }).click()
  await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
  await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
}

async function openRouteRulesTab(page: Page, name: string) {
  const row = page.locator('table tbody tr').filter({ hasText: name }).first()
  await row.getByRole('button', { name: '路由规则' }).click()
  await page.waitForURL(/\/admin\/access-models\/[0-9a-f-]{36}/)
  await page.waitForLoadState('networkidle')
}

test.describe('Route Rules (per access model)', () => {
  test('route-rules button opens the access-model detail page', async ({ page }) => {
    const name = uniqueName('TestAM')
    await createAccessModel(page, name)
    await openRouteRulesTab(page, name)

    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByRole('tab', { name: '路由规则' })).toBeVisible()
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('empty state shows default trigger node and synced banner', async ({ page }) => {
    const name = uniqueName('TestAM')
    await createAccessModel(page, name)
    await openRouteRulesTab(page, name)

    await expect(page.getByText('尚无版本，编辑画布后点击部署即创建')).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await expect(page.getByText('已同步')).toBeVisible()
  })

  test('basic info tab shows access model fields', async ({ page }) => {
    const name = uniqueName('TestAM')
    await createAccessModel(page, name)
    await openRouteRulesTab(page, name)

    await page.getByRole('tab', { name: '基本信息' }).click()
    await expect(page.getByText('在接入模型列表页可编辑以上字段。')).toBeVisible()
  })

  test('adding a node shows undeployed-changes banner', async ({ page }) => {
    const name = uniqueName('TestAM')
    await createAccessModel(page, name)
    await openRouteRulesTab(page, name)
    await expect(page.locator('.react-flow')).toBeVisible()

    const initialNodeCount = await page.locator('.react-flow__node').count()
    await page.locator('.react-flow__pane').dblclick({ position: { x: 500, y: 350 } })
    await page.waitForSelector('[role="dialog"]', { state: 'visible' })
    await page.locator('[role="dialog"] button').first().click()

    await page.waitForFunction(
      (initial) => document.querySelectorAll('.react-flow__node').length > initial,
      initialNodeCount,
    )
    await expect(page.getByText('有未部署的变更')).toBeVisible()
  })

  test('deploy creates and activates the first version', async ({ page }) => {
    const name = uniqueName('TestAM')
    await createAccessModel(page, name)
    await openRouteRulesTab(page, name)
    await expect(page.locator('.react-flow__node')).toHaveCount(1)

    // 拖动唯一的 modelTrigger 节点使画布变脏（不新增节点，保持图结构可通过校验）
    const node = page.locator('.react-flow__node').first()
    const box = await node.boundingBox()
    if (!box) throw new Error('trigger node not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByText('有未部署的变更')).toBeVisible()
    await page.getByRole('button', { name: '部署' }).click()

    await expect(page.getByText('active')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('已同步')).toBeVisible({ timeout: 15000 })
  })
})
