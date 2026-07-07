import { test as base, expect } from '@playwright/test'

export const test = base

export { expect }

export function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export async function navigateToAdmin(page: import('@playwright/test').Page, path: string) {
  await page.goto(`/admin${path}`)
  await page.waitForLoadState('networkidle')
}

export async function createProvider(page: import('@playwright/test').Page, name: string) {
  await page.goto('/admin/providers')
  await page.waitForLoadState('networkidle')

  await page.click('button:has-text("添加供应商")')
  await page.waitForSelector('[role="dialog"]')
  await page.fill('input#name', name)
  await page.click('button:has-text("提交")')
  await page.waitForSelector(`text=${name}`)
}

export async function deleteProvider(page: import('@playwright/test').Page, name: string) {
  await page.goto('/admin/providers')
  await page.waitForLoadState('networkidle')

  const card = page.locator(`text=${name}`).first()
  await card.hover()
  await page.locator(`button:has-text("删除")`).first().click()

  page.on('dialog', (dialog) => dialog.accept())
  await page.waitForTimeout(500)
}
