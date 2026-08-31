import { describe, it, expect } from 'bun:test'
const { joinUrl } = await import('./join-url?v=1')

describe('joinUrl', () => {
  // basic cases
  it('joins simple base and endpoint', () => {
    expect(joinUrl('https://api.com', '/v1/chat')).toBe('https://api.com/v1/chat')
  })

  it('handles base with trailing slash', () => {
    expect(joinUrl('https://api.com/', '/v1/chat')).toBe('https://api.com/v1/chat')
  })

  it('handles endpoint without leading slash', () => {
    expect(joinUrl('https://api.com', 'v1/chat')).toBe('https://api.com/v1/chat')
  })

  it('handles base with trailing slash and endpoint without leading slash', () => {
    expect(joinUrl('https://api.com/', 'v1/chat')).toBe('https://api.com/v1/chat')
  })

  // overlap cases
  it('deduplicates overlapping /v1 path', () => {
    expect(joinUrl('https://api.com/v1', '/v1/chat')).toBe('https://api.com/v1/chat')
  })

  it('deduplicates overlapping multi-segment path', () => {
    expect(joinUrl('https://api.com/v1/chat', '/v1/chat/completions')).toBe(
      'https://api.com/v1/chat/completions',
    )
  })

  it('deduplicates partial overlap at path end', () => {
    expect(joinUrl('https://api.com/v1/chat', '/chat/completions')).toBe(
      'https://api.com/v1/chat/completions',
    )
  })

  // non-overlap cases
  it('concatenates non-overlapping paths', () => {
    expect(joinUrl('https://api.com/api', '/v1/chat')).toBe('https://api.com/api/v1/chat')
  })

  it('concatenates completely different paths', () => {
    expect(joinUrl('https://api.com/foo/bar', '/baz/qux')).toBe('https://api.com/foo/bar/baz/qux')
  })

  // base with no path (just host)
  it('handles base with no path component', () => {
    expect(joinUrl('https://api.com', '/chat')).toBe('https://api.com/chat')
  })

  it('handles base with no path and endpoint without slash', () => {
    expect(joinUrl('https://api.com', 'chat')).toBe('https://api.com/chat')
  })

  // complex nested paths
  it('handles deeply nested endpoint path', () => {
    expect(joinUrl('https://api.com/v1', '/v1/chat/completions')).toBe(
      'https://api.com/v1/chat/completions',
    )
  })

  it('handles base with multiple segments and single-segment endpoint', () => {
    expect(joinUrl('https://api.com/a/b/c', '/d')).toBe('https://api.com/a/b/c/d')
  })

  // edge: baseUrl with port
  it('preserves port number in base URL', () => {
    expect(joinUrl('http://localhost:8080', '/v1/chat')).toBe('http://localhost:8080/v1/chat')
  })

  // edge: full deduplication (identical paths)
  it('deduplicates when endpoint path is a suffix of base path', () => {
    expect(joinUrl('https://api.com/v1/chat', '/chat')).toBe('https://api.com/v1/chat')
  })

  // version-segment semantic overlap: base already has its own API version in the
  // path, different from the endpoint's hardcoded version string. Must dedupe by
  // "this is a version segment", not by exact string match, or it produces a
  // path that doesn't exist upstream (e.g. .../v4/v1/chat/completions).
  it('deduplicates when base version differs from endpoint version (v4 vs v1)', () => {
    expect(joinUrl('https://open.bigmodel.cn/api/paas/v4/', '/v1/chat/completions')).toBe(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    )
  })

  it('deduplicates version segments regardless of number (v2 vs v1)', () => {
    expect(joinUrl('https://api.com/v2', '/v1/chat')).toBe('https://api.com/v2/chat')
  })

  it('deduplicates dotted version segments (v2.1 vs v1)', () => {
    expect(joinUrl('https://api.com/v2.1', '/v1/chat')).toBe('https://api.com/v2.1/chat')
  })

  it('does not treat a non-version last segment as a version match', () => {
    expect(joinUrl('https://api.com/vault', '/v1/chat')).toBe('https://api.com/vault/v1/chat')
  })
})
