import { test, expect } from '@playwright/test'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'

test.describe('页面基本加载', () => {
  test('首页正常加载', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title).toBeTruthy()
  })

  test('admin 登录页面可访问', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByText('管理员登录')).toBeVisible()
  })

  test('admin 路由规则页面未登录时重定向', async ({ page }) => {
    await page.goto('/admin/model-routes')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})

test.describe('API 端点', () => {
  test('首页可访问', async ({ request }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
  })

  test('登录 API 正常', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.token).toBeTruthy()
  })

  test('错误密码登录被拒绝', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { password: 'wrong-password' },
    })
    expect(response.status()).toBe(401)
  })

  test('路由规则列表 API 需要认证', async ({ request }) => {
    const response = await request.get('/api/model-routes')
    expect([308, 401]).toContain(response.status())
  })

  test('带 token 可访问路由规则 API', async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    const loginBody = await loginResponse.json()
    const token = loginBody.token

    const response = await request.get('/api/model-routes', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('Flow 数据 API 可访问', async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    const loginBody = await loginResponse.json()
    const token = loginBody.token

    const response = await request.get('/api/model-routes/flow', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.routes).toBeDefined()
    expect(body.data.virtualModels).toBeDefined()
  })

  test('虚拟模型列表 API 可访问', async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    const loginBody = await loginResponse.json()
    const token = loginBody.token

    const response = await request.get('/api/virtual-models', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status()).toBe(200)
  })
})

test.describe('登录后页面 (UI)', () => {
  test('登录并访问路由规则页面', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Login via API
    const loginResponse = await page.request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    const loginBody = await loginResponse.json()
    const token = loginBody.token

    // Set token in localStorage via init script
    await context.addInitScript((tokenStr) => {
      localStorage.setItem('admin_token', tokenStr)
    }, token)

    // Navigate
    await page.goto('/admin/model-routes')
    await page.waitForLoadState('networkidle')

    // Verify page loads (not redirected to login)
    await expect(page).toHaveURL(/\/admin\/model-routes/)

    // Wait for ReactFlow to render
    await page.waitForTimeout(2000)
    await expect(page.locator('div.react-flow')).toBeVisible()

    // Verify node palette is present
    await expect(page.getByText('节点模板')).toBeVisible()
    await expect(page.getByText('虚拟模型')).toBeVisible()
    await expect(page.getByText('路由目标')).toBeVisible()

    await context.close()
  })

  test('路由规则页面显示 Flow 编辑器标题', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    const loginResponse = await page.request.post('/api/auth/login', {
      data: { password: ADMIN_PASSWORD },
    })
    const loginBody = await loginResponse.json()

    await context.addInitScript((t) => {
      localStorage.setItem('admin_token', t)
    }, loginBody.token)

    await page.goto('/admin/model-routes')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Verify ReactFlow container exists
    const flowDiv = page.locator('div.react-flow')
    await expect(flowDiv).toBeVisible()

    // Verify the heading
    const headingText = await page.textContent('h2')
    expect(headingText).toContain('路由规则')

    await context.close()
  })
})
