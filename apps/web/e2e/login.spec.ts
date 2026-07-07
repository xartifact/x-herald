import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=管理员登录')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
  })

  test('login with correct password redirects to admin', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input#password', 'test')
    await page.getByRole('button', { name: '登录' }).click()
    await page.waitForURL('/admin')
    await expect(page).toHaveURL(/\/admin/)
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input#password', 'wrong-password')
    await page.getByRole('button', { name: '登录' }).click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
