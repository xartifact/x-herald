import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'

import { collapseDuplicateVersionSegments, withCollapsedPath } from './normalize-path'

describe('collapseDuplicateVersionSegments', () => {
  it('folds a doubled version segment', () => {
    expect(collapseDuplicateVersionSegments('/api/v1/v1/messages')).toBe('/api/v1/messages')
  })

  it('folds every repetition, not just one', () => {
    expect(collapseDuplicateVersionSegments('/api/v1/v1/v1/v1/models')).toBe('/api/v1/models')
  })

  it('handles version segments with a minor or suffix', () => {
    expect(collapseDuplicateVersionSegments('/api/v2.1/v2.1/messages')).toBe('/api/v2.1/messages')
    expect(collapseDuplicateVersionSegments('/api/v1beta/v1beta/models')).toBe('/api/v1beta/models')
  })

  it('keeps a single version segment untouched', () => {
    expect(collapseDuplicateVersionSegments('/api/v1/messages')).toBe('/api/v1/messages')
  })

  it('leaves differing version numbers alone', () => {
    // 不同版本不是重复，语义不明，交给路由/上游 404。
    expect(collapseDuplicateVersionSegments('/api/v2/v1/messages')).toBe('/api/v2/v1/messages')
  })

  it('never folds non-version segments', () => {
    // 资源段重复可能合法（第二段是名字或 id），折叠会改写到别的资源。
    expect(collapseDuplicateVersionSegments('/api/keys/keys')).toBe('/api/keys/keys')
    expect(collapseDuplicateVersionSegments('/api/v1/models/models')).toBe('/api/v1/models/models')
  })

  it('preserves a trailing slash', () => {
    expect(collapseDuplicateVersionSegments('/api/v1/v1/')).toBe('/api/v1/')
  })

  it('is idempotent', () => {
    const once = collapseDuplicateVersionSegments('/api/v1/v1/messages')
    expect(collapseDuplicateVersionSegments(once)).toBe(once)
  })
})

describe('withCollapsedPath', () => {
  it('returns null when there is nothing to fold', () => {
    expect(withCollapsedPath(new Request('http://localhost/api/v1/models'))).toBeNull()
  })

  it('returns a request whose URL carries the folded path', () => {
    const folded = withCollapsedPath(new Request('http://localhost/api/v1/v1/messages'))
    expect(folded).not.toBeNull()
    expect(new URL(folded!.url).pathname).toBe('/api/v1/messages')
  })

  it('preserves method, headers and body', async () => {
    const original = new Request('http://localhost/api/v1/v1/messages?beta=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'xg_test' },
      body: JSON.stringify({ model: 'Agent' }),
    })

    const folded = withCollapsedPath(original)!
    expect(folded.method).toBe('POST')
    expect(folded.headers.get('x-api-key')).toBe('xg_test')
    expect(new URL(folded.url).search).toBe('?beta=true')
    expect(await folded.text()).toBe('{"model":"Agent"}')
  })

  it('leaves websocket upgrade requests alone', () => {
    // Bun 的 server.upgrade() 只认握手时的原始 request；换新 Request 会让
    // WS 握手直接失败，所以这里必须返回 null（= 不改写）。
    const upgrade = new Request('http://localhost/api/v1/v1/audio/stream', {
      headers: { upgrade: 'websocket', connection: 'Upgrade' },
    })
    expect(withCollapsedPath(upgrade)).toBeNull()
  })
})

describe('engine entry normalization', () => {
  /** 只装一条路由的最小 app，避免为这一层行为拖起整个引擎。 */
  function appWithNormalization(): Hono {
    const app = new Hono()
    app.post('/api/v1/messages', (c) => c.json({ ok: true, path: c.req.path }))
    app.request = ((input: string | Request, requestInit?: RequestInit) => {
      const base =
        input instanceof Request
          ? input
          : new Request(`http://localhost${String(input)}`, requestInit)
      return app.fetch(withCollapsedPath(base) ?? base)
    }) as typeof app.request
    return app
  }

  it('serves the handler for a doubled /v1 path', async () => {
    const res = await appWithNormalization().request('/api/v1/v1/messages', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, path: '/api/v1/messages' })
  })
})
