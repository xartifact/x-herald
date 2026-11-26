import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mountSpaFallback } from './spa'

/** 最小 dist：一个真实资源 + 一个 index.html，足以区分「文件命中」与「前端路由回落」。 */
function withDistDir(run: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'x-herald-spa-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
    try {
      await run(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

function appWithSpa(distDir: string): Hono {
  const app = new Hono()
  app.get('/api/v1/models', (c) => c.json({ ok: true }))
  mountSpaFallback(app, distDir)
  app.notFound((c) => c.json({ error: 'API endpoint not found', path: c.req.path }, 404))
  return app
}

describe('mountSpaFallback', () => {
  it(
    'serves index.html for a front-end route',
    withDistDir(async (dir) => {
      const res = await appWithSpa(dir).request('/admin/logs')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<title>app</title>')
    }),
  )

  it(
    'serves a real asset file',
    withDistDir(async (dir) => {
      const res = await appWithSpa(dir).request('/assets/app.js')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('console.log(1)')
    }),
  )

  it(
    'leaves unmatched /api paths to the JSON 404 handler',
    withDistDir(async (dir) => {
      // 关键行为：写错 base URL 的 API 请求必须拿到可诊断的 JSON，
      // 而不是 200 + HTML（客户端只会看到 `Unexpected token '<'`）。
      const res = await appWithSpa(dir).request('/api/v1/nope')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toContain('application/json')
    }),
  )

  it(
    'leaves unmatched bare /v1 paths to the JSON 404 handler',
    withDistDir(async (dir) => {
      const res = await appWithSpa(dir).request('/v1/messages')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toContain('application/json')
    }),
  )

  it(
    'still serves the matched API route',
    withDistDir(async (dir) => {
      const res = await appWithSpa(dir).request('/api/v1/models')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    }),
  )
})
