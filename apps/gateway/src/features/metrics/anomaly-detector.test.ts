import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'

const realDbClient = await import('../../db/client')
const originalGetDatabase = realDbClient.getDatabase

import { instancePerfSnapshots, anomalyEvents } from '@xartifact/x-llm-gateway-db'

let mockSnapshots: unknown[] = []
let mockAnomalyEvents: unknown[] = []

const mockInsertValues = mock((_value: unknown) => Promise.resolve())
const mockUpdateSetWhere = mock(() => Promise.resolve())

const createAnomalyChain = (result: unknown) => {
  const chain = {
    where: mock(() => chain),
    orderBy: mock(() => chain),
    limit: mock(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

const mockDb = {
  select: mock(() => mockDb),
  from: mock((table: unknown) => {
    if (table === instancePerfSnapshots) {
      return {
        where: mock(() => Promise.resolve(mockSnapshots)),
      }
    }
    return createAnomalyChain(mockAnomalyEvents)
  }),
  insert: mock(() => ({
    values: mockInsertValues,
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mockUpdateSetWhere,
    })),
  })),
}

mock.module('../../db/client', () => ({
  getDatabase: mock(() => mockDb),
}))

import { AnomalyDetector } from './anomaly-detector'

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
})

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    instanceId: 'inst-1',
    instanceName: 'Test Instance',
    providerName: 'Test Provider',
    ...overrides,
  }
}

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector

  beforeEach(() => {
    detector = new AnomalyDetector()
    mockSnapshots = []
    mockAnomalyEvents = []
    mockInsertValues.mockClear()
    mockUpdateSetWhere.mockClear()
  })

  describe('detect()', () => {
    it('returns 0 when no snapshots', async () => {
      mockSnapshots = []
      const count = await detector.detect()
      expect(count).toBe(0)
    })

    it('Rule 0 (TTFB): does not trigger when ttfbP95=5000', async () => {
      mockSnapshots = [createSnapshot({ ttfbP95: 5000 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(0)
    })

    it('Rule 0 (TTFB): triggers when ttfbP95=10001', async () => {
      mockSnapshots = [createSnapshot({ ttfbP95: 10001 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(1)
      expect(mockInsertValues.mock.calls.length).toBeGreaterThan(0)
      const insertCall = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
      expect(insertCall.type).toBe('slow_request')
      expect(insertCall.severity).toBe('warning')
      expect(insertCall.description).toBe('High TTFB: 10001ms (P95)')
    })

    it('Rule 1 (success rate): does not trigger when successRate=0.9', async () => {
      mockSnapshots = [createSnapshot({ successRate: 0.9 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(0)
    })

    it('Rule 1 (success rate): triggers when successRate=0.79', async () => {
      mockSnapshots = [createSnapshot({ successRate: 0.79 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(1)
      expect(mockInsertValues.mock.calls.length).toBeGreaterThan(0)
      const insertCall = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
      expect(insertCall.type).toBe('high_error_rate')
      expect(insertCall.severity).toBe('critical')
      expect(insertCall.description).toBe('High error rate: 21.0% failures')
    })

    it('Rule 2 (output tokens): does not trigger when avgOutputTokens=1000', async () => {
      mockSnapshots = [createSnapshot({ avgOutputTokens: 1000 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(0)
    })

    it('Rule 2 (output tokens): triggers when avgOutputTokens=50001', async () => {
      mockSnapshots = [createSnapshot({ avgOutputTokens: 50001 })]
      mockAnomalyEvents = []
      const count = await detector.detect()
      expect(count).toBe(1)
      expect(mockInsertValues.mock.calls.length).toBeGreaterThan(0)
      const insertCall = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
      expect(insertCall.type).toBe('high_token_usage')
      expect(insertCall.severity).toBe('warning')
      expect(insertCall.description).toBe('High token usage: avg 50001 output tokens')
    })

    it('does not insert duplicate events', async () => {
      mockSnapshots = [createSnapshot({ ttfbP95: 10001 })]
      mockAnomalyEvents = [{ id: 'existing-1' }]
      const count = await detector.detect()
      expect(count).toBe(0)
      expect(mockInsertValues.mock.calls.length).toBe(0)
    })
  })

  describe('getUnresolved()', () => {
    it('returns array of unresolved events', async () => {
      mockAnomalyEvents = [
        { id: 'event-1', resolved: false, createdAt: '2025-01-01' },
        { id: 'event-2', resolved: false, createdAt: '2025-01-02' },
      ]
      const events = await detector.getUnresolved()
      expect(events).toHaveLength(2)
      expect(events[0].id).toBe('event-1')
      expect(events[1].id).toBe('event-2')
    })
  })

  describe('getAll()', () => {
    it('returns all events ordered by createdAt', async () => {
      mockAnomalyEvents = [
        { id: 'event-1', createdAt: '2025-01-01' },
        { id: 'event-2', createdAt: '2025-01-02' },
      ]
      const events = await detector.getAll(100)
      expect(events).toHaveLength(2)
    })
  })

  describe('resolve()', () => {
    it('calls update with resolved=true', async () => {
      await detector.resolve('event-1')
      expect(mockUpdateSetWhere.mock.calls.length).toBeGreaterThan(0)
    })
  })
})
