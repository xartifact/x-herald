import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'

import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-db'
import type { InstancePerfData } from '../../features/metrics/services/instance-perf-cache'

mock.module('../../features/metrics/services/instance-perf-cache', () => ({
  fetchGroupInstancesPerf: mock(async () => new Map<string, InstancePerfData>()),
}))

import { filterCandidates, selectByStrategy, FAILOVER_STATUS_CODES } from './router-selector'
import {
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
  RequestRejectedError,
} from './router-selector'

mock.module('./circuit-breaker-policy', () => ({
  CB_CONFIG_KEY: 'CIRCUIT_BREAKER_CONFIG',
  DEFAULT_CONFIG: {
    failureThreshold: 3,
    openDurationMs: 60_000,
    maxBackoffMs: 300_000,
    maxTripsBeforeCooldown: 5,
    cooldownDurationMs: 1_800_000,
  },
  runtimeConfig: {
    failureThreshold: 3,
    openDurationMs: 60_000,
    maxBackoffMs: 300_000,
    maxTripsBeforeCooldown: 5,
    cooldownDurationMs: 1_800_000,
  },
  configureCircuitBreaker: () => {},
  refreshConfigIfStale: async () => {},
  calculateBackoff: (baseMs: number, tripCount: number, maxMs: number) => {
    if (tripCount <= 1) return baseMs
    return Math.min(baseMs * Math.pow(2, tripCount - 1), maxMs)
  },
  persistEvent: async () => {},
  getMaxBackoffMs: () => 300_000,
  getMaxTripsBeforeCooldown: () => 5,
  getCooldownDurationMs: () => 1_800_000,
}))

import { circuitBreakerRegistry } from './circuit-breaker-state'
import { fetchGroupInstancesPerf } from '../../features/metrics/services/instance-perf-cache'

type ProviderSelect = typeof import('@xartifact/x-herald-db').providers.$inferSelect

function createTestProvider(overrides: Partial<ProviderSelect> = {}): ProviderSelect {
  return {
    id: crypto.randomUUID(),
    name: 'Test Provider',
    apiKey: 'sk-test',
    protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ProviderSelect
}

function createTestInstance(overrides: Partial<ModelInstance> = {}): ModelInstance {
  return {
    id: crypto.randomUUID(),
    providerId: crypto.randomUUID(),
    name: 'Test Instance',
    actualModelName: 'gpt-4',
    description: null,
    config: null,
    weight: 100,
    priority: 0,
    costPer1kTokens: null,
    healthCheckUrl: null,
    enabled: true,
    status: 'unknown',
    lastCheckedAt: null,
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date(),
    ...overrides,
  } as ModelInstance
}

const defaultGroupCapabilities = {
  streaming: true,
  functionCalling: true,
  vision: false,
  jsonMode: true,
  maxTokens: 8192,
  contextWindow: 128000,
}

function createTestGroup(overrides: Partial<ModelGroup> = {}): ModelGroup {
  return {
    id: crypto.randomUUID(),
    name: 'gpt-4',
    aliases: [],
    displayName: 'GPT-4',
    description: null,
    category: 'chat',
    capabilities: { ...defaultGroupCapabilities },
    supportedProtocols: ['openai'],
    enabled: true,
    routingConfig: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ModelGroup
}

const defaultRoutingContext = {
  requestedModel: 'gpt-4',
  streaming: false,
  hasTools: false,
  hasVision: false,
  virtualKeyId: crypto.randomUUID(),
}

const circuitInstancesToReset: string[] = []

describe('filterCandidates', () => {
  afterEach(async () => {
    for (const id of circuitInstancesToReset) {
      await circuitBreakerRegistry.manualReset(id)
    }
    circuitInstancesToReset.length = 0
  })

  it('should include instance when all checks pass', async () => {
    const instance = createTestInstance({ status: 'unknown' })
    const provider = createTestProvider()
    const group = createTestGroup()

    const result = await filterCandidates([{ instance, provider }], defaultRoutingContext, group)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].instance.id).toBe(instance.id)
  })

  it('should exclude instance when circuit breaker is open', async () => {
    const openId = 'cb-open-test'
    const okId = 'cb-ok-test'
    await circuitBreakerRegistry.manualTrip(openId)
    circuitInstancesToReset.push(openId)
    const openInstance = createTestInstance({ id: openId })
    const okInstance = createTestInstance({ id: okId })
    const provider = createTestProvider()
    const group = createTestGroup()

    const result = await filterCandidates(
      [
        { instance: openInstance, provider },
        { instance: okInstance, provider },
      ],
      defaultRoutingContext,
      group,
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].instance.id).toBe(okId)
  })

  it('should exclude instance with status "down"', async () => {
    const downInstance = createTestInstance({ status: 'down' })
    const okInstance = createTestInstance({ status: 'unknown' })
    const provider = createTestProvider()
    const group = createTestGroup()

    const result = await filterCandidates(
      [
        { instance: downInstance, provider },
        { instance: okInstance, provider },
      ],
      defaultRoutingContext,
      group,
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].instance.id).toBe(okInstance.id)
  })

  it('should exclude instance lacking streaming capability when context.streaming=true', async () => {
    const instance = createTestInstance()
    const provider = createTestProvider()
    const group = createTestGroup({
      capabilities: { ...defaultGroupCapabilities, streaming: false },
    })

    const result = await filterCandidates(
      [{ instance, provider }],
      { ...defaultRoutingContext, streaming: true },
      group,
    )
    expect(result.candidates).toHaveLength(0)
  })

  it('should exclude instance lacking functionCalling capability when context.hasTools=true', async () => {
    const instance = createTestInstance()
    const provider = createTestProvider()
    const group = createTestGroup({
      capabilities: { ...defaultGroupCapabilities, functionCalling: false },
    })

    const result = await filterCandidates(
      [{ instance, provider }],
      { ...defaultRoutingContext, hasTools: true },
      group,
    )
    expect(result.candidates).toHaveLength(0)
  })

  it('should exclude instance lacking vision capability when context.hasVision=true', async () => {
    const instance = createTestInstance()
    const provider = createTestProvider()
    const group = createTestGroup({ capabilities: { ...defaultGroupCapabilities, vision: false } })

    const result = await filterCandidates(
      [{ instance, provider }],
      { ...defaultRoutingContext, hasVision: true },
      group,
    )
    expect(result.candidates).toHaveLength(0)
  })

  it('should exclude instance when provider protocol is disabled', async () => {
    const instance = createTestInstance()
    const provider = createTestProvider({
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: false } },
    })
    const group = createTestGroup()

    const result = await filterCandidates([{ instance, provider }], defaultRoutingContext, group)
    expect(result.candidates).toHaveLength(0)
  })

  it('should allow instance with capability overrides from instance config', async () => {
    const instance = createTestInstance({ config: { capabilityOverrides: { vision: true } } })
    const provider = createTestProvider()
    const group = createTestGroup({ capabilities: { ...defaultGroupCapabilities, vision: false } })

    const result = await filterCandidates(
      [{ instance, provider }],
      { ...defaultRoutingContext, hasVision: true },
      group,
    )
    expect(result.candidates).toHaveLength(1)
  })

  it('should return empty array when all instances are filtered out', async () => {
    const instance1 = createTestInstance({ status: 'down' })
    const cbId = 'cb-all-down'
    await circuitBreakerRegistry.manualTrip(cbId)
    circuitInstancesToReset.push(cbId)
    const instance2 = createTestInstance({ id: cbId })
    const provider = createTestProvider()
    const group = createTestGroup()

    const result = await filterCandidates(
      [
        { instance: instance1, provider },
        { instance: instance2, provider },
      ],
      defaultRoutingContext,
      group,
    )

    expect(result.candidates).toHaveLength(0)
  })
})

describe('selectByStrategy', () => {
  beforeEach(async () => {
    ;(fetchGroupInstancesPerf as ReturnType<typeof mock>).mockImplementation(async () => new Map())
  })

  function createCandidate(
    overrides: { instance?: Partial<ModelInstance>; provider?: Partial<ProviderSelect> } = {},
  ) {
    return {
      instance: createTestInstance(overrides.instance),
      provider: createTestProvider(overrides.provider),
      group: createTestGroup(),
    }
  }

  describe('priority strategy (default)', () => {
    it('should sort candidates by priority ascending', async () => {
      const high = createCandidate({ instance: { priority: 10 } })
      const low = createCandidate({ instance: { priority: 0 } })
      const mid = createCandidate({ instance: { priority: 5 } })

      const result = await selectByStrategy([high, low, mid], 'priority', 'g1')

      expect(result[0].instance.priority).toBe(0)
      expect(result[1].instance.priority).toBe(5)
      expect(result[2].instance.priority).toBe(10)
    })

    it('should sort by createdAt when priority is equal', async () => {
      const older = createCandidate({
        instance: { priority: 0, createdAt: new Date('2025-01-01') },
      })
      const newer = createCandidate({
        instance: { priority: 0, createdAt: new Date('2025-06-01') },
      })

      const result = await selectByStrategy([newer, older], 'priority', 'g2')

      expect(result[0].instance.id).toBe(older.instance.id)
      expect(result[1].instance.id).toBe(newer.instance.id)
    })

    it('should return single candidate as-is', async () => {
      const c = createCandidate()
      const result = await selectByStrategy([c], 'priority', 'g3')
      expect(result).toHaveLength(1)
    })
  })

  describe('round_robin strategy', () => {
    it('should rotate starting position on each call', async () => {
      const a = createCandidate({ instance: { priority: 0, name: 'A' } })
      const b = createCandidate({ instance: { priority: 1, name: 'B' } })

      const first = await selectByStrategy([a, b], 'round_robin', 'rr-1')
      const second = await selectByStrategy([a, b], 'round_robin', 'rr-1')

      expect(first[0].instance.name).toBe('A')
      expect(second[0].instance.name).toBe('B')
    })

    it('should use separate counters per groupId', async () => {
      const a = createCandidate({ instance: { priority: 0, name: 'A' } })
      const b = createCandidate({ instance: { priority: 1, name: 'B' } })

      const r1 = await selectByStrategy([a, b], 'round_robin', 'rr-group-a')
      const r2 = await selectByStrategy([a, b], 'round_robin', 'rr-group-b')

      expect(r1[0].instance.name).toBe('A')
      expect(r2[0].instance.name).toBe('A')
    })

    it('should wrap around after all candidates', async () => {
      const a = createCandidate({ instance: { priority: 0, name: 'A' } })
      const b = createCandidate({ instance: { priority: 1, name: 'B' } })

      await selectByStrategy([a, b], 'round_robin', 'rr-wrap')
      await selectByStrategy([a, b], 'round_robin', 'rr-wrap')
      const third = await selectByStrategy([a, b], 'round_robin', 'rr-wrap')

      expect(third[0].instance.name).toBe('A')
    })
  })

  describe('weighted strategy', () => {
    it('should return all candidates with selected one first', async () => {
      const a = createCandidate({ instance: { weight: 100, name: 'A', priority: 0 } })
      const b = createCandidate({ instance: { weight: 100, name: 'B', priority: 1 } })

      const result = await selectByStrategy([a, b], 'weighted', 'w-1')

      expect(result).toHaveLength(2)
      expect(['A', 'B']).toContain(result[0].instance.name!)
    })
  })

  describe('cost_optimized strategy', () => {
    it('should sort candidates by total cost ascending', async () => {
      const expensive = createCandidate({
        instance: {
          costPer1kTokens: { input: 0.03, output: 0.06 },
          name: 'Expensive',
          priority: 0,
        },
      })
      const cheap = createCandidate({
        instance: { costPer1kTokens: { input: 0.01, output: 0.02 }, name: 'Cheap', priority: 0 },
      })

      const result = await selectByStrategy([expensive, cheap], 'cost_optimized', 'co-1')

      expect(result[0].instance.name).toBe('Cheap')
      expect(result[1].instance.name).toBe('Expensive')
    })

    it('should place candidates without cost data after those with cost', async () => {
      const withCost = createCandidate({
        instance: { costPer1kTokens: { input: 0.01, output: 0.01 }, name: 'WithCost', priority: 0 },
      })
      const noCost = createCandidate({
        instance: { costPer1kTokens: null, name: 'NoCost', priority: 0 },
      })

      const result = await selectByStrategy([noCost, withCost], 'cost_optimized', 'co-2')

      expect(result[0].instance.name).toBe('WithCost')
      expect(result[1].instance.name).toBe('NoCost')
    })
  })

  describe('least_response_time strategy', () => {
    it('should sort candidates by ttfb ascending when perf data exists', async () => {
      const slow = createCandidate({ instance: { id: 'slow', name: 'Slow', priority: 0 } })
      const fast = createCandidate({ instance: { id: 'fast', name: 'Fast', priority: 0 } })

      ;(fetchGroupInstancesPerf as ReturnType<typeof mock>).mockImplementation(async () => {
        const map = new Map<string, InstancePerfData>()
        map.set('slow', {
          ttfbAvg: 2000,
          ttfbP95: null,
          latencyAvg: null,
          successRate: null,
          avgRetryCount: null,
        })
        map.set('fast', {
          ttfbAvg: 200,
          ttfbP95: null,
          latencyAvg: null,
          successRate: null,
          avgRetryCount: null,
        })
        return map
      })

      const result = await selectByStrategy([slow, fast], 'least_response_time', 'lrt-1')

      expect(result[0].instance.name).toBe('Fast')
      expect(result[1].instance.name).toBe('Slow')
    })

    it('should place candidates without perf data after those with perf', async () => {
      const withPerf = createCandidate({ instance: { id: 'with-perf', name: 'Perf', priority: 0 } })
      const noPerf = createCandidate({ instance: { id: 'no-perf', name: 'NoPerf', priority: 0 } })

      ;(fetchGroupInstancesPerf as ReturnType<typeof mock>).mockImplementation(async () => {
        const map = new Map<string, InstancePerfData>()
        map.set('with-perf', {
          ttfbAvg: 500,
          ttfbP95: null,
          latencyAvg: null,
          successRate: null,
          avgRetryCount: null,
        })
        return map
      })

      const result = await selectByStrategy([noPerf, withPerf], 'least_response_time', 'lrt-2')

      expect(result[0].instance.name).toBe('Perf')
      expect(result[1].instance.name).toBe('NoPerf')
    })
  })

  describe('smart strategy', () => {
    it('should sort candidates by smart score descending', async () => {
      const good = createCandidate({ instance: { id: 'good', name: 'Good', priority: 0 } })
      const bad = createCandidate({ instance: { id: 'bad', name: 'Bad', priority: 0 } })

      ;(fetchGroupInstancesPerf as ReturnType<typeof mock>).mockImplementation(async () => {
        const map = new Map<string, InstancePerfData>()
        map.set('good', {
          ttfbAvg: 200,
          ttfbP95: null,
          latencyAvg: null,
          successRate: 0.99,
          avgRetryCount: 0.1,
        })
        map.set('bad', {
          ttfbAvg: 3000,
          ttfbP95: null,
          latencyAvg: null,
          successRate: 0.5,
          avgRetryCount: 4,
        })
        return map
      })

      const result = await selectByStrategy([good, bad], 'smart', 'smart-1')

      expect(result[0].instance.name).toBe('Good')
      expect(result[1].instance.name).toBe('Bad')
    })
  })

  describe('unknown strategy', () => {
    it('should fall back to priority sort', async () => {
      const high = createCandidate({ instance: { priority: 10, name: 'High' } })
      const low = createCandidate({ instance: { priority: 0, name: 'Low' } })

      const result = await selectByStrategy([high, low], 'nonexistent_strategy', 'unk-1')

      expect(result[0].instance.name).toBe('Low')
      expect(result[1].instance.name).toBe('High')
    })
  })
})

describe('Error classes', () => {
  it('ModelNotFoundError has correct name and message', async () => {
    const err = new ModelNotFoundError('gpt-4')
    expect(err.name).toBe('ModelNotFoundError')
    expect(err.message).toContain('gpt-4')
    expect(err.message).toContain('not found')
  })

  it('ModelDisabledError has correct name and message', async () => {
    const err = new ModelDisabledError('gpt-4')
    expect(err.name).toBe('ModelDisabledError')
    expect(err.message).toContain('disabled')
  })

  it('NoAvailableInstanceError has correct name and message', async () => {
    const err = new NoAvailableInstanceError('gpt-4')
    expect(err.name).toBe('NoAvailableInstanceError')
    expect(err.message).toContain('No available instances')
  })

  it('NoSuitableInstanceError has correct name and message', async () => {
    const err = new NoSuitableInstanceError('gpt-4')
    expect(err.name).toBe('NoSuitableInstanceError')
    expect(err.message).toContain('No suitable instance')
  })

  it('RequestRejectedError has correct name and message', async () => {
    const err = new RequestRejectedError('Rate limit exceeded')
    expect(err.name).toBe('RequestRejectedError')
    expect(err.message).toBe('Rate limit exceeded')
  })
})

describe('FAILOVER_STATUS_CODES', () => {
  it('should contain all expected status codes', async () => {
    expect(FAILOVER_STATUS_CODES.has(429)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(500)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(502)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(503)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(504)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(521)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(522)).toBe(true)
    expect(FAILOVER_STATUS_CODES.has(524)).toBe(true)
  })

  it('should have exactly 8 entries', async () => {
    expect(FAILOVER_STATUS_CODES.size).toBe(8)
  })

  it('should not contain non-failover codes', async () => {
    expect(FAILOVER_STATUS_CODES.has(400)).toBe(false)
    expect(FAILOVER_STATUS_CODES.has(401)).toBe(false)
    expect(FAILOVER_STATUS_CODES.has(200)).toBe(false)
  })
})
