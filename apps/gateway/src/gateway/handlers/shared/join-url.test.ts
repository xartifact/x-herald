import { describe, it, expect } from 'bun:test'
import { joinUrl } from './join-url'

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
    expect(joinUrl('https://api.com/v1/chat', '/v1/chat/completions')).toBe('https://api.com/v1/chat/completions')
  })

  it('deduplicates partial overlap at path end', () => {
    expect(joinUrl('https://api.com/v1/chat', '/chat/completions')).toBe('https://api.com/v1/chat/completions')
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
    expect(joinUrl('https://api.com/v1', '/v1/chat/completions')).toBe('https://api.com/v1/chat/completions')
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
})