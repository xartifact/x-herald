import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test'
import { Hono } from 'hono'
import type { VirtualKey } from '@xartifact/x-llm-gateway-db'

// ─── Pre-load cache reset ───────────────────────────────────────────────────
;(globalThis as Record<string, unknown>)._vkCache = new Map<string, unknown>()

// ─── Mock module state ──────────────────────────────────────────────────────
let currentMockDb: ReturnType<typeof createMockDb> | null = null
let currentRateLimitResult: {
  allowed: boolean
  reason?: string
  rpm?: unknown
  rpd?: unknown
  token?: unknown
} | null = null

function createMockDb() {
  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  }
}

function createRateLimitResult() {
  return { allowed: true, rpm: null, rpd: null, token: null }
}

// ─── Capture real modules before mocking ──────────────────────────────────
const realDbClient = await import('../db/client')
const originalGetDatabase = realDbClient.getDatabase
const realRateLimitEngine = await import('../gateway/services/rate-limit-engine')
const originalRateLimitEngine = realRateLimitEngine.rateLimitEngine
const originalRateLimitEngineCheck = originalRateLimitEngine.check.bind(originalRateLimitEngine)
const realLogger = await import('../lib/logger')
const originalDefaultLogger = realLogger.default
const originalChildMethod = originalDefaultLogger.child.bind(originalDefaultLogger)

// ─── Mock modules ───────────────────────────────────────────────────────────
mock.module('../db/client', () => ({
  getDatabase: () => currentMockDb ?? createMockDb(),
}))

mock.module('../gateway/services/rate-limit-engine', () => ({
  rateLimitEngine: {
    check: () => currentRateLimitResult ?? createRateLimitResult(),
  },
}))

mock.module('../lib/logger', () => ({
  default: {
    child: mock(() => ({
      warn: mock(() => {}),
      info: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      trace: mock(() => {}),
    })),
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    trace: mock(() => {}),
  },
}))

// ─── Import module under test (dynamic import after mocks) ──────────────────
const { virtualKeyMiddleware, invalidateVirtualKeyCache } = await import('./virtual-key')

// ─── Import factories ───────────────────────────────────────────────────────
import { createTestVirtualKey } from '../test/factories'

// ─── Helpers ────────────────────────────────────────────────────────────────
function createTestApp() {
  const app = new Hono()
  app.use('*', virtualKeyMiddleware)
  app.get('/test', (c) => {
    const key = c.get('virtualKey') as VirtualKey | undefined
    return c.json({ ok: true, keyId: key?.id, keyName: key?.name })
  })
  return app
}

function setDbWithKey(key: unknown) {
  currentMockDb = {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([key])),
        })),
      })),
    })),
  }
}

function setDbWithNoKey() {
  currentMockDb = {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  }
}

function setDbThatThrows() {
  currentMockDb = {
    select: mock(() => {
      throw new Error('DB connection failed')
    }),
  }
}

function setCacheWithKey(key: VirtualKey) {
  const cache = (globalThis as Record<string, unknown>)._vkCache as Map<
    string,
    { value: VirtualKey; expiresAt: number }
  >
  cache.set(key.key, { value: key, expiresAt: Date.now() + 60_000 })
}

function clearCache() {
  const cache = (globalThis as Record<string, unknown>)._vkCache as Map<string, unknown> | undefined
  cache?.clear()
}

// ─── Tests ──────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module('../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
  mock.module('../gateway/services/rate-limit-engine', () => ({
    rateLimitEngine: originalRateLimitEngine,
  }))
  mock.module('../lib/logger', () => ({
    default: originalDefaultLogger,
  }))
  ;(globalThis as Record<string, unknown>)._vkCache = new Map()
})

describe('virtualKeyMiddleware', () => {
  beforeEach(() => {
    clearCache()
    currentMockDb = createMockDb()
    currentRateLimitResult = createRateLimitResult()
  })

  afterEach(() => {
    mock.module('../db/client', () => ({
      getDatabase: () => currentMockDb ?? createMockDb(),
    }))
    mock.module('../gateway/services/rate-limit-engine', () => ({
      rateLimitEngine: {
        check: () => currentRateLimitResult ?? createRateLimitResult(),
      },
    }))
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 1: Header extraction
  // ══════════════════════════════════════════════════════════════════════════
  describe('header extraction', () => {
    it('returns 401 when no Authorization and no x-api-key', async () => {
      const app = createTestApp()
      const res = await app.request('/test')
      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('UNAUTHORIZED')
      expect(body.error).toContain('Missing API key')
    })

    it('extracts key from Authorization: Bearer <key>', async () => {
      const key = createTestVirtualKey({ key: 'sk-bearer-test' })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-bearer-test' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.keyId).toBe(key.id)
      expect(body.keyName).toBe(key.name)
    })

    it('falls through to x-api-key when Authorization lacks Bearer prefix', async () => {
      const key = createTestVirtualKey({ key: 'sk-xapi-test' })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: {
          Authorization: 'Basic abc123',
          'x-api-key': 'sk-xapi-test',
        },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.keyId).toBe(key.id)
    })

    it('extracts key from x-api-key header', async () => {
      const key = createTestVirtualKey({ key: 'sk-xapi-only' })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { 'x-api-key': 'sk-xapi-only' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.keyId).toBe(key.id)
    })

    it('returns 401 when Authorization header is empty', async () => {
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: '' },
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 2: Cache path
  // ══════════════════════════════════════════════════════════════════════════
  describe('cache path', () => {
    it('cache hit with enabled, non-expired key sets context and calls next', async () => {
      const key = createTestVirtualKey({ key: 'sk-cache-ok' })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-cache-ok' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.ok).toBe(true)
      expect(body.keyId).toBe(key.id)
    })

    it('cache hit with disabled key returns 403 KEY_DISABLED', async () => {
      const key = createTestVirtualKey({ key: 'sk-cache-disabled', enabled: false })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-cache-disabled' },
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('KEY_DISABLED')
      expect(body.error).toContain('disabled')
    })

    it('cache hit with expired key returns 403 KEY_EXPIRED', async () => {
      const key = createTestVirtualKey({
        key: 'sk-cache-expired',
        expiresAt: new Date(Date.now() - 60_000),
      })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-cache-expired' },
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('KEY_EXPIRED')
      expect(body.error).toContain('expired')
    })

    it('cache hit with rate limit exceeded returns 429', async () => {
      const key = createTestVirtualKey({ key: 'sk-cache-ratelimit', rateLimitRpm: 10 })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: false,
        reason: 'RPM limit exceeded',
        rpm: { limit: 10, remaining: 0, resetAt: Date.now() + 60_000 },
        rpd: null,
        token: null,
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-cache-ratelimit' },
      })
      expect(res.status).toBe(429)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error.type).toBe('rate_limit_error')
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(body.error.limit.type).toBe('rpm')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 3: DB path
  // ══════════════════════════════════════════════════════════════════════════
  describe('DB path', () => {
    it('cache miss, DB found, enabled, not expired sets context and calls next', async () => {
      const key = createTestVirtualKey({ key: 'sk-db-ok' })
      setDbWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-ok' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.keyId).toBe(key.id)
      expect(body.keyName).toBe(key.name)
    })

    it('cache miss, DB not found returns 401 INVALID_KEY', async () => {
      setDbWithNoKey()
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-missing' },
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('INVALID_KEY')
      expect(body.error).toContain('Invalid API key')
    })

    it('cache miss, DB found but disabled returns 403 KEY_DISABLED', async () => {
      const key = createTestVirtualKey({ key: 'sk-db-disabled', enabled: false })
      setDbWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-disabled' },
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('KEY_DISABLED')
    })

    it('cache miss, DB found but expired returns 403 KEY_EXPIRED', async () => {
      const key = createTestVirtualKey({
        key: 'sk-db-expired',
        expiresAt: new Date(Date.now() - 60_000),
      })
      setDbWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-expired' },
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('KEY_EXPIRED')
    })

    it('cache miss, DB query throws returns 500 AUTH_ERROR', async () => {
      setDbThatThrows()
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-error' },
      })
      expect(res.status).toBe(500)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('AUTH_ERROR')
      expect(body.error).toContain('Authentication failed')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 4: Rate limiting
  // ══════════════════════════════════════════════════════════════════════════
  describe('rate limiting', () => {
    it('no rate limits configured passes through without rate limit headers', async () => {
      const key = createTestVirtualKey({
        key: 'sk-no-limits',
        rateLimitRpm: null,
        rateLimitRpd: null,
        tokenLimitDaily: null,
      })
      setCacheWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-no-limits' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-RPM-Limit')).toBeNull()
      expect(res.headers.get('X-RateLimit-RPD-Limit')).toBeNull()
      expect(res.headers.get('X-RateLimit-Tokens-Limit')).toBeNull()
    })

    it('RPM exceeded returns 429 with RPM headers', async () => {
      const key = createTestVirtualKey({ key: 'sk-rpm-limit', rateLimitRpm: 100 })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: false,
        reason: 'RPM limit exceeded',
        rpm: { limit: 100, remaining: 0, resetAt: Date.now() + 60_000 },
        rpd: null,
        token: null,
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-rpm-limit' },
      })
      expect(res.status).toBe(429)
      expect(res.headers.get('X-RateLimit-RPM-Limit')).toBe('100')
      expect(res.headers.get('X-RateLimit-RPM-Remaining')).toBe('0')
      expect(res.headers.get('X-RateLimit-RPM-Reset')).toBeTruthy()
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error.limit.type).toBe('rpm')
    })

    it('RPD exceeded returns 429 with RPD headers', async () => {
      const key = createTestVirtualKey({ key: 'sk-rpd-limit', rateLimitRpd: 1000 })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: false,
        reason: 'RPD limit exceeded',
        rpm: null,
        rpd: { limit: 1000, remaining: 0, resetAt: Date.now() + 86400000 },
        token: null,
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-rpd-limit' },
      })
      expect(res.status).toBe(429)
      expect(res.headers.get('X-RateLimit-RPD-Limit')).toBe('1000')
      expect(res.headers.get('X-RateLimit-RPD-Remaining')).toBe('0')
      expect(res.headers.get('X-RateLimit-RPD-Reset')).toBeTruthy()
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error.limit.type).toBe('rpd')
    })

    it('daily token limit exceeded returns 429 with token headers', async () => {
      const key = createTestVirtualKey({ key: 'sk-token-limit', tokenLimitDaily: 50000n })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: false,
        reason: 'Daily token limit exceeded',
        rpm: null,
        rpd: null,
        token: { limit: 50000, remaining: 0, resetAt: Date.now() + 86400000 },
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-token-limit' },
      })
      expect(res.status).toBe(429)
      expect(res.headers.get('X-RateLimit-Tokens-Limit')).toBe('50000')
      expect(res.headers.get('X-RateLimit-Tokens-Remaining')).toBe('0')
      expect(res.headers.get('X-RateLimit-Tokens-Reset')).toBeTruthy()
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error.limit.type).toBe('token')
    })

    it('allowed rate limit sets remaining quota headers', async () => {
      const key = createTestVirtualKey({ key: 'sk-allowed', rateLimitRpm: 100 })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: true,
        reason: undefined,
        rpm: { limit: 100, remaining: 99, resetAt: Date.now() + 60_000 },
        rpd: null,
        token: null,
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-allowed' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-RPM-Limit')).toBe('100')
      expect(res.headers.get('X-RateLimit-RPM-Remaining')).toBe('99')
      expect(res.headers.get('X-RateLimit-RPM-Reset')).toBeTruthy()
    })

    it('combined rate limit headers set all limit types', async () => {
      const key = createTestVirtualKey({
        key: 'sk-combined',
        rateLimitRpm: 100,
        rateLimitRpd: 1000,
        tokenLimitDaily: 50000n,
      })
      setCacheWithKey(key)
      currentRateLimitResult = {
        allowed: true,
        reason: undefined,
        rpm: { limit: 100, remaining: 95, resetAt: Date.now() + 60_000 },
        rpd: { limit: 1000, remaining: 900, resetAt: Date.now() + 86400000 },
        token: { limit: 50000, remaining: 40000, resetAt: Date.now() + 86400000 },
      }
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-combined' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-RPM-Limit')).toBe('100')
      expect(res.headers.get('X-RateLimit-RPD-Limit')).toBe('1000')
      expect(res.headers.get('X-RateLimit-Tokens-Limit')).toBe('50000')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 5: Cache invalidation
  // ══════════════════════════════════════════════════════════════════════════
  describe('cache invalidation', () => {
    it('invalidateVirtualKeyCache removes entry from cache', async () => {
      const key = createTestVirtualKey({ key: 'sk-invalidate' })
      setCacheWithKey(key)

      // Verify cache works first
      const app = createTestApp()
      let res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-invalidate' },
      })
      expect(res.status).toBe(200)

      // Invalidate
      invalidateVirtualKeyCache('sk-invalidate')

      // Now DB is empty, so it should 401
      setDbWithNoKey()
      res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-invalidate' },
      })
      expect(res.status).toBe(401)
      expect(((await res.json()) as Record<string, unknown>).code).toBe('INVALID_KEY')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Group 6: Edge cases
  // ══════════════════════════════════════════════════════════════════════════
  describe('edge cases', () => {
    it('expired cache entry is cleaned up and treated as cache miss', async () => {
      const key = createTestVirtualKey({ key: 'sk-expired-cache' })
      const cache = (globalThis as Record<string, unknown>)._vkCache as Map<
        string,
        { value: VirtualKey; expiresAt: number }
      >
      cache.set(key.key, { value: key, expiresAt: Date.now() - 1000 })

      setDbWithNoKey()
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-expired-cache' },
      })
      expect(res.status).toBe(401)
      // Entry should have been cleaned up
      expect(cache.has(key.key)).toBe(false)
    })

    it('DB found key is cached for subsequent requests', async () => {
      const key = createTestVirtualKey({ key: 'sk-db-caches' })
      setDbWithKey(key)
      const app = createTestApp()

      // First request hits DB
      const res1 = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-caches' },
      })
      expect(res1.status).toBe(200)

      // Now remove DB mock so second request would fail without cache
      setDbWithNoKey()
      const res2 = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-db-caches' },
      })
      expect(res2.status).toBe(200)
    })

    it('handles key with exactly reached expiration time', async () => {
      const key = createTestVirtualKey({
        key: 'sk-exact-expire',
        expiresAt: new Date(Date.now() - 1),
      })
      setDbWithKey(key)
      const app = createTestApp()
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk-exact-expire' },
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.code).toBe('KEY_EXPIRED')
    })
  })
})
