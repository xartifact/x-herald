import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'

import { requestBodyLimit, resolveBodyLimitBytes } from './request-body-limit'

/**
 * 请求体上限（GitHub Issue #5 P1-5）。
 *
 * 验收点只有两个：超限时**明确回 413**（而不是读爆内存后回 500），
 * 以及响应体说清楚「上限是多少、怎么调」。
 */
describe('requestBodyLimit', () => {
  function appWithLimit(): Hono {
    const app = new Hono()
    app.use('*', requestBodyLimit())
    app.post('/echo', async (c) => {
      const body = (await c.req.json()) as { n?: number }
      return c.json({ received: body.n ?? null })
    })
    return app
  }

  it('accepts a body under the limit', async () => {
    const app = appWithLimit()
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 1 }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { received: number }).received).toBe(1)
  })

  it('rejects an oversized body with 413 and a self-explanatory message', async () => {
    const app = appWithLimit()
    // 超过默认上限（64 MB）的声明长度即可触发，无需真的分配那么多内存
    const res = await app.request('/echo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(resolveBodyLimitBytes() + 1024),
      },
      body: '{}',
    })

    expect(res.status).toBe(413)
    const body = (await res.json()) as {
      error: { code: string; message: string }
    }
    expect(body.error.code).toBe('REQUEST_TOO_LARGE')
    // 说清楚上限与调整方式，客户端不能只看到「413」
    expect(body.error.message).toContain('MB')
    expect(body.error.message).toContain('GATEWAY_MAX_REQUEST_BODY_MB')
  })

  it('honours GATEWAY_MAX_REQUEST_BODY_MB', async () => {
    const previous = process.env.GATEWAY_MAX_REQUEST_BODY_MB
    process.env.GATEWAY_MAX_REQUEST_BODY_MB = '1'
    try {
      expect(resolveBodyLimitBytes()).toBe(1024 * 1024)

      const app = appWithLimit()
      const res = await app.request('/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: 2 }),
      })
      // 小 body 在 1 MB 上限下仍然通过
      expect(res.status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.GATEWAY_MAX_REQUEST_BODY_MB
      else process.env.GATEWAY_MAX_REQUEST_BODY_MB = previous
    }
  })

  it('falls back to the default when the env value is not a positive number', () => {
    const previous = process.env.GATEWAY_MAX_REQUEST_BODY_MB
    for (const value of ['0', '-5', 'abc', '']) {
      process.env.GATEWAY_MAX_REQUEST_BODY_MB = value
      expect(resolveBodyLimitBytes()).toBe(64 * 1024 * 1024)
    }
    if (previous === undefined) delete process.env.GATEWAY_MAX_REQUEST_BODY_MB
    else process.env.GATEWAY_MAX_REQUEST_BODY_MB = previous
  })
})
