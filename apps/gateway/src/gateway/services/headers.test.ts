import { describe, it, expect } from 'bun:test'
import { shouldFilterHeader, PROVIDER_FILTERED_HEADERS } from './headers'

describe('shouldFilterHeader', () => {
  // exact match: auth headers
  it('filters authorization header', () => {
    expect(shouldFilterHeader('authorization')).toBe(true)
  })

  it('filters x-api-key header', () => {
    expect(shouldFilterHeader('x-api-key')).toBe(true)
  })

  // exact match: length headers
  it('filters content-length header', () => {
    expect(shouldFilterHeader('content-length')).toBe(true)
  })

  it('filters transfer-encoding header', () => {
    expect(shouldFilterHeader('transfer-encoding')).toBe(true)
  })

  // exact match: hop-by-hop headers
  it('filters connection header', () => {
    expect(shouldFilterHeader('connection')).toBe(true)
  })

  it('filters host header', () => {
    expect(shouldFilterHeader('host')).toBe(true)
  })

  // exact match: proxy-injected headers
  it('filters x-forwarded-for header', () => {
    expect(shouldFilterHeader('x-forwarded-for')).toBe(true)
  })

  it('filters x-forwarded-proto header', () => {
    expect(shouldFilterHeader('x-forwarded-proto')).toBe(true)
  })

  // exact match: session affinity
  it('filters x-session-affinity header', () => {
    expect(shouldFilterHeader('x-session-affinity')).toBe(true)
  })

  // exact match: gateway internal tracking
  it('filters x-conversation-id header', () => {
    expect(shouldFilterHeader('x-conversation-id')).toBe(true)
  })

  it('filters x-request-id header', () => {
    expect(shouldFilterHeader('x-request-id')).toBe(true)
  })

  // exact match: listed x-stainless-* variants
  it('filters x-stainless-lang header', () => {
    expect(shouldFilterHeader('x-stainless-lang')).toBe(true)
  })

  it('filters x-stainless-package-version header', () => {
    expect(shouldFilterHeader('x-stainless-package-version')).toBe(true)
  })

  // prefix match: unlisted x-stainless-* variants
  it('filters x-stainless-retry-count header (unlisted variant)', () => {
    expect(shouldFilterHeader('x-stainless-retry-count')).toBe(true)
  })

  it('filters x-stainless-sdk-header (unlisted variant)', () => {
    expect(shouldFilterHeader('x-stainless-sdk-header')).toBe(true)
  })

  // case insensitivity
  it('is case insensitive (Authorization)', () => {
    expect(shouldFilterHeader('Authorization')).toBe(true)
  })

  it('is case insensitive (CONTENT-LENGTH)', () => {
    expect(shouldFilterHeader('CONTENT-LENGTH')).toBe(true)
  })

  it('is case insensitive (X-Forwarded-For)', () => {
    expect(shouldFilterHeader('X-Forwarded-For')).toBe(true)
  })

  it('is case insensitive (X-STAINLESS-LANG)', () => {
    expect(shouldFilterHeader('X-STAINLESS-LANG')).toBe(true)
  })

  // non-matching headers (should NOT be filtered)
  it('does not filter content-type header', () => {
    expect(shouldFilterHeader('content-type')).toBe(false)
  })

  it('does not filter accept header', () => {
    expect(shouldFilterHeader('accept')).toBe(false)
  })

  it('does not filter user-agent header', () => {
    expect(shouldFilterHeader('user-agent')).toBe(false)
  })

  it('does not filter x-custom-header', () => {
    expect(shouldFilterHeader('x-custom-header')).toBe(false)
  })

  it('does not filter empty header name', () => {
    expect(shouldFilterHeader('')).toBe(false)
  })

  // PROVIDER_FILTERED_HEADERS is a Set
  it('exports PROVIDER_FILTERED_HEADERS as a Set', () => {
    expect(PROVIDER_FILTERED_HEADERS).toBeInstanceOf(Set)
  })
})