import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'

const realDbClient = await import('../../../db/client')
const originalGetDatabase = realDbClient.getDatabase
const realLogger = await import('../../../lib/logger')

// ─── Mock DB state ────────────────────────────────────────────────────────────

let selectFromResult: unknown[] = []
let transactionResult = 0
let shouldThrowOnSelect = false
let shouldThrowOnTransaction = false

const getDatabaseMock = mock(() => ({
  select: mock(() => ({
    from: mock(() => {
      if (shouldThrowOnSelect) {
        return Promise.reject(new Error('DB select error'))
      }
      return Promise.resolve(selectFromResult)
    }),
  })),
  transaction: mock((callback: (tx: unknown) => Promise<unknown>) => {
    if (shouldThrowOnTransaction) {
      return Promise.reject(new Error('DB transaction error'))
    }
    const txInsert = mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(() => Promise.resolve()),
      })),
    }))
    return callback({ insert: txInsert })
  }),
}))

// ─── Mock modules ───────────────────────────────────────────────────────────────

mock.module('../../../db/client', () => ({
  getDatabase: getDatabaseMock,
}))

mock.module('../../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    trace: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      trace: mock(() => {}),
    })),
  },
}))

// ─── Import module under test ─────────────────────────────────────────────────

const { calculateScore, recalculateAll } = await import('./rank-calculator')

// ─── Tests ────────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
  mock.module('../../../lib/logger', () => realLogger)
})

describe('calculateScore', () => {
  it('returns 0 for cold start (requestCount = 0)', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-01T00:00:00Z')
    expect(calculateScore(0, lastRequestAt, now)).toBe(0)
  })

  it('returns 0 for negative requestCount', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-01T00:00:00Z')
    expect(calculateScore(-5, lastRequestAt, now)).toBe(0)
  })

  it('returns full score when request is at reference time', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = now
    expect(calculateScore(100, lastRequestAt, now)).toBe(100)
  })

  it('halves score after 7 days (exponential decay)', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-08T00:00:00Z')
    const score = calculateScore(100, lastRequestAt, now)
    expect(score).toBeCloseTo(50, 1)
  })

  it('quarters score after 14 days', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-01T00:00:00Z')
    const score = calculateScore(100, lastRequestAt, now)
    expect(score).toBeCloseTo(25, 1)
  })

  it('enforces minimum floor of 0.001 for very old requests', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2020-01-01T00:00:00Z')
    const score = calculateScore(1, lastRequestAt, now)
    expect(score).toBe(0.001)
  })

  it('uses current time when now is not provided', () => {
    const lastRequestAt = new Date()
    const score = calculateScore(50, lastRequestAt)
    expect(score).toBeCloseTo(50, 1)
  })

  it('handles future lastRequestAt gracefully (no negative time)', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-20T00:00:00Z')
    const score = calculateScore(100, lastRequestAt, now)
    expect(score).toBe(100)
  })

  it('shows high retention with recent requests', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2024-06-14T00:00:00Z')
    const score = calculateScore(1000, lastRequestAt, now)
    expect(score).toBeGreaterThan(900)
    expect(score).toBeLessThan(1000)
  })

  it('returns minimum floor for very old requests with low count', () => {
    const now = new Date('2024-06-15T00:00:00Z')
    const lastRequestAt = new Date('2023-01-01T00:00:00Z')
    const score = calculateScore(1, lastRequestAt, now)
    expect(score).toBe(0.001)
  })
})

describe('recalculateAll', () => {
  beforeEach(() => {
    mock.restore()
    selectFromResult = []
    transactionResult = 0
    shouldThrowOnSelect = false
    shouldThrowOnTransaction = false
  })

  it('returns processed: 0 when no stats exist', async () => {
    const result = await recalculateAll()
    expect(result.processed).toBe(0)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('returns processed count and duration for existing stats', async () => {
    selectFromResult = [
      {
        modelId: 'gpt-4',
        requestCount: 10,
        lastRequestAt: new Date('2024-06-10T00:00:00Z'),
        currentScore: 5,
        lastScoredAt: new Date('2024-06-10T00:00:00Z'),
      },
    ]

    const result = await recalculateAll()
    expect(result.processed).toBe(1)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('propagates DB select errors', async () => {
    shouldThrowOnSelect = true
    await expect(recalculateAll()).rejects.toThrow('DB select error')
  })

  it('propagates DB transaction errors', async () => {
    selectFromResult = [
      {
        modelId: 'gpt-4',
        requestCount: 10,
        lastRequestAt: new Date('2024-06-10T00:00:00Z'),
        currentScore: 5,
        lastScoredAt: new Date('2024-06-10T00:00:00Z'),
      },
    ]
    shouldThrowOnTransaction = true
    await expect(recalculateAll()).rejects.toThrow('DB transaction error')
  })
})
