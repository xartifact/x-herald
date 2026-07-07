import { Hono } from 'hono'

export interface TestRequestOptions {
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

export function testRequest(
  app: Hono,
  method: string,
  path: string,
  options?: TestRequestOptions,
): Response | Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  }

  if (options?.body) {
    init.body = JSON.stringify(options.body)
  }

  return app.request(path, init)
}

export function authenticatedRequest(
  app: Hono,
  method: string,
  path: string,
  token: string,
  options?: TestRequestOptions,
): Response | Promise<Response> {
  return testRequest(app, method, path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}
