import { describe, it, expect } from 'bun:test'

import { resolveSessionIdentity } from './session-identity'

/**
 * 会话标识解析：优先级、冲突、缺失。
 *
 * 这些用例守的是压缩能力的输入契约——解析错了不会报错，只会让「同一段对话」
 * 被当成不同会话（压缩失效）或把两个会话并成一个（状态互相污染）。
 */
describe('resolveSessionIdentity', () => {
  it('takes prompt_cache_key from the body first', () => {
    const identity = resolveSessionIdentity({
      headers: { 'x-conversation-id': 'from-header', 'x-session-id': 'also-header' },
      body: { prompt_cache_key: 'from-body' },
    })
    expect(identity).toEqual({ key: 'from-body', source: 'prompt_cache_key' })
  })

  it('falls back through headers in declared priority order', () => {
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [{ 'x-conversation-id': 'conv' }, 'x-conversation-id'],
      [{ 'x-session-id': 'sess' }, 'x-session-id'],
      [{ 'x-claude-code-session-id': 'cc' }, 'x-claude-code-session-id'],
      [{ 'x-grok-session-id': 'grok' }, 'x-grok-session-id'],
      [{ 'x-opencode-session-id': 'oc' }, 'x-opencode-session-id'],
    ]
    for (const [headers, source] of cases) {
      expect(resolveSessionIdentity({ headers })?.source).toBe(source)
    }
  })

  it('resolves a conflict deterministically to the highest-priority source', () => {
    const headers = {
      'x-conversation-id': 'a',
      'x-session-id': 'b',
      'x-claude-code-session-id': 'c',
    }
    // 重复调用必须得到同一结果：会话聚合依赖这条性质
    const first = resolveSessionIdentity({ headers })
    const second = resolveSessionIdentity({ headers })
    expect(first).toEqual(second)
    expect(first?.key).toBe('a')
  })

  it('accepts grok header variants by prefix', () => {
    const identity = resolveSessionIdentity({ headers: { 'x-grok-conversation': 'grok-variant' } })
    expect(identity?.key).toBe('grok-variant')
    expect(identity?.source).toBe('x-grok-session-id')
  })

  it('returns null when nothing identifies the session', () => {
    // 无标识必须返回 null：调用方据此跳过压缩。返回随机 key 会让每个请求
    // 都成为独立会话，压缩既无收益又要付摘要成本。
    expect(resolveSessionIdentity({ headers: {} })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: { messages: [] } })).toBeNull()
    expect(resolveSessionIdentity({ headers: { 'x-session-id': '   ' } })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: { prompt_cache_key: '' } })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: { prompt_cache_key: 42 } })).toBeNull()
  })

  it('ignores prompt_cache_key shapes that are not a plain string', () => {
    expect(resolveSessionIdentity({ headers: {}, body: null })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: 'text' })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: ['prompt_cache_key'] })).toBeNull()
    expect(resolveSessionIdentity({ headers: {}, body: { prompt_cache_key: { a: 1 } } })).toBeNull()
  })

  it('trims and truncates to the column width', () => {
    expect(resolveSessionIdentity({ headers: { 'x-session-id': '  abc  ' } })?.key).toBe('abc')
    const long = resolveSessionIdentity({ headers: { 'x-session-id': 'y'.repeat(400) } })
    expect(long?.key).toHaveLength(255)
  })

  it('is case-sensitive on key content but reads lowercase header keys', () => {
    // 头部键由调用方归一化为小写后再传入；内容原样保留（大小写不同的两个 id 是两会话）
    const a = resolveSessionIdentity({ headers: { 'x-session-id': 'AbC' } })
    const b = resolveSessionIdentity({ headers: { 'x-session-id': 'abc' } })
    expect(a?.key).toBe('AbC')
    expect(a?.key).not.toBe(b?.key)
  })
})
