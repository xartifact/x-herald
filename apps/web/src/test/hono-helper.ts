/**
 * Hono 测试辅助函数
 * 
 * 用法：import { testRequest } from '@/test/hono-helper'
 * 
 * 提供 Hono app 的请求发送能力，无需 mock Context。
 * 使用 Hono 内置的 app.request() 方法，模拟真实请求流程。
 */

import { Hono } from 'hono'

interface TestRequestOptions {
  headers?: Record<string, string>
  body?: unknown
}

/**
 * 向 Hono app 发送测试请求
 * 
 * @example
 * ```ts
 * const app = new Hono()
 * app.route('/api/providers', providerRoutes)
 * 
 * const res = await testRequest(app, 'GET', '/api/providers')
 * expect(res.status).toBe(200)
 * ```
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  options: TestRequestOptions = {}
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }

  return app.request(path, init)
}

/**
 * 创建带认证头的测试请求
 */
export async function authenticatedRequest(
  app: Hono,
  method: string,
  path: string,
  options: TestRequestOptions = {}
): Promise<Response> {
  return testRequest(app, method, path, {
    ...options,
    headers: {
      ...options.headers,
      'x-api-key': 'sk-test-key',
    },
  })
}
