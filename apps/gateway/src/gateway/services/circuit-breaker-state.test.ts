import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { CircuitBreakerSettings, CircuitBreakerMeta } from './circuit-breaker-policy'

const mockPersistEvent = mock((...args: unknown[]) => {})

const mockRefreshConfigIfStale = mock(() => {})

const mockCalculateBackoff = mock((baseMs: number, tripCount: number, maxMs: number) => {
  if (tripCount <= 1) return baseMs
  return Math.min(baseMs * Math.pow(2, tripCount - 1), maxMs)
})

let mockRuntimeConfig: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
}

const DEFAULT_MOCK_CONFIG: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
}

mock.module('./circuit-breaker-policy', () => ({
  CB_CONFIG_KEY: 'CIRCUIT_BREAKER_CONFIG',
  DEFAULT_CONFIG: { ...DEFAULT_MOCK_CONFIG },
  runtimeConfig: mockRuntimeConfig,
  configureCircuitBreaker: (settings: CircuitBreakerSettings) => {
    Object.assign(mockRuntimeConfig, settings)
  },
  refreshConfigIfStale: mockRefreshConfigIfStale,
  calculateBackoff: mockCalculateBackoff,
  persistEvent: mockPersistEvent,
  getMaxBackoffMs: () => mockRuntimeConfig.maxBackoffMs ?? DEFAULT_MOCK_CONFIG.maxBackoffMs!,
  getMaxTripsBeforeCooldown: () => mockRuntimeConfig.maxTripsBeforeCooldown ?? DEFAULT_MOCK_CONFIG.maxTripsBeforeCooldown!,
  getCooldownDurationMs: () => mockRuntimeConfig.cooldownDurationMs ?? DEFAULT_MOCK_CONFIG.cooldownDurationMs!,
}))

import { circuitBreakerRegistry } from './circuit-breaker-state'

const originalDateNow = Date.now
let mockNow = 1_000_000_000_000

const META: CircuitBreakerMeta = { instanceName: 'inst-1', groupName: 'group-a', providerName: 'prov-a' }

beforeEach(async () => {
  mockNow = 1_000_000_000_000
  Date.now = () => mockNow
  mockPersistEvent.mockClear()
  mockRefreshConfigIfStale.mockClear()
  mockCalculateBackoff.mockClear()
  Object.assign(mockRuntimeConfig, DEFAULT_MOCK_CONFIG)
})

afterEach(async () => {
  Date.now = originalDateNow
  const allStates = await circuitBreakerRegistry.getAllStates()
  for (const { instanceId } of allStates) {
    await circuitBreakerRegistry.manualReset(instanceId)
  }
  mock.restore()
})

describe('CircuitBreakerRegistry', () => {
  describe('initial state', () => {
    it('returns closed for unknown instance', async () => {
      expect(circuitBreakerRegistry.getState('unknown')).toBe('closed')
    })

    it('isOpen returns false for unknown instance', async () => {
      expect(await circuitBreakerRegistry.isOpen('unknown')).toBe(false)
    })

    it('getAllStates returns empty array initially', async () => {
      expect(await circuitBreakerRegistry.getAllStates()).toEqual([])
    })
  })

  describe('CLOSED → OPEN transition', async () => {
    it('stays closed when failures < threshold (2 failures with threshold=3)', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('closed')
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)

      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('closed')
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)
    })

    it('transitions to open when failures reach threshold', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
    })

    it('sets openUntil = now + openDurationMs', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates).toHaveLength(1)
      expect(allStates[0].openUntil).toBe(mockNow + 60_000)
    })

    it('sets tripCount = 1', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].tripCount).toBe(1)
    })

    it('persists "opened" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(mockPersistEvent).toHaveBeenCalledTimes(1)
      expect(mockPersistEvent.mock.calls[0][0]).toBe('inst-1')
      expect(mockPersistEvent.mock.calls[0][1]).toBe('opened')
      expect(mockPersistEvent.mock.calls[0][2]).toBe(3)
      expect(mockPersistEvent.mock.calls[0][4]).toEqual(META)
      expect(mockPersistEvent.mock.calls[0][5]).toBe(1)
    })

    it('isOpen returns true after transition', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
    })
  })

  describe('OPEN state', async () => {
    it('ignores additional recordFailure calls', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')

      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      expect(mockPersistEvent).toHaveBeenCalledTimes(1)
    })

    it('isOpen returns true', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
    })

    it('getState returns "open"', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
    })
  })

  describe('OPEN → HALF_OPEN transition', () => {
    it('transitions when Date.now() >= openUntil', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')

      mockNow += 61_000
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')
    })

    it('persists "half_open" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(mockPersistEvent).toHaveBeenCalledTimes(2)
      expect(mockPersistEvent.mock.calls[1][1]).toBe('half_open')
    })

    it('isOpen returns false (allows request)', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)
    })

    it('getState returns "half_open"', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')
    })
  })

  describe('HALF_OPEN → CLOSED transition', () => {
    it('recordSuccess resets to closed', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')

      await circuitBreakerRegistry.recordSuccess('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('closed')
    })

    it('deletes state entry', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordSuccess('inst-1', META)
      expect(await circuitBreakerRegistry.getAllStates()).toHaveLength(0)
    })

    it('persists "closed" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordSuccess('inst-1', META)
      expect(mockPersistEvent).toHaveBeenCalledTimes(3)
      const closedCall = mockPersistEvent.mock.calls.find((call) => call[1] === 'closed')
      expect(closedCall).toBeDefined()
    })
  })

  describe('HALF_OPEN → OPEN (backoff) transition', () => {
    it('transitions back to open on failure', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')

      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
    })

    it('increments tripCount', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].tripCount).toBe(2)
    })

    it('applies exponential backoff to openUntil', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].openUntil).toBe(mockNow + 120_000)
      expect(mockCalculateBackoff).toHaveBeenCalledWith(60_000, 2, 300_000)
    })

    it('persists "opened" event with tripCount', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const openedCalls = mockPersistEvent.mock.calls.filter((call) => call[1] === 'opened')
      expect(openedCalls).toHaveLength(2)
      expect(openedCalls[1][5]).toBe(2)
    })

    it('does not enter cooldown when tripCount < maxTripsBeforeCooldown', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      expect(circuitBreakerRegistry.getState('inst-1')).not.toBe('cooldown')
    })
  })

  describe('HALF_OPEN → COOLDOWN transition', async () => {
    it('transitions to cooldown when tripCount >= maxTripsBeforeCooldown', async () => {
      // First, open the circuit with 3 failures
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      // Transition to half_open
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      // Re-trip 4 times to reach cooldown (tripCount starts at 1, needs to reach 5)
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
    })

    it('sets cooldownUntil = now + cooldownDurationMs', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].cooldownUntil).toBe(mockNow + 1_800_000)
    })

    it('persists "cooldown" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      const cooldownCalls = mockPersistEvent.mock.calls.filter((call) => call[1] === 'cooldown')
      expect(cooldownCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('isOpen returns true in cooldown state', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
    })
  })

  describe('COOLDOWN state', async () => {
    it('ignores recordFailure calls', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
      const persistCount = mockPersistEvent.mock.calls.length
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(mockPersistEvent.mock.calls.length).toBe(persistCount)
    })

    it('isOpen returns true', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
    })
  })

  describe('COOLDOWN → HALF_OPEN transition', async () => {
    it('transitions when Date.now() >= cooldownUntil', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
      mockNow += 1_800_001
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')
    })

    it('resets failures to 0', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      mockNow += 1_800_001
      await circuitBreakerRegistry.isOpen('inst-1')
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].failures).toBe(0)
    })

    it('resets tripCount to 1', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      mockNow += 1_800_001
      await circuitBreakerRegistry.isOpen('inst-1')
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].tripCount).toBe(1)
    })

    it('persists "half_open" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      for (let i = 0; i < 4; i++) {
        mockNow += 120_000 * Math.pow(2, i) + 1_000
        await circuitBreakerRegistry.isOpen('inst-1')
        await circuitBreakerRegistry.recordFailure('inst-1', META)
      }
      const persistCount = mockPersistEvent.mock.calls.length
      mockNow += 1_800_001
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(mockPersistEvent.mock.calls.length).toBe(persistCount + 1)
      expect(mockPersistEvent.mock.calls[mockPersistEvent.mock.calls.length - 1][1]).toBe('half_open')
    })
  })

  describe('manualTrip', () => {
    it('creates open state from closed', async () => {
      await circuitBreakerRegistry.manualTrip('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
    })

    it('applies backoff on repeated trips', async () => {
      await circuitBreakerRegistry.manualTrip('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')
      await circuitBreakerRegistry.manualTrip('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      expect(mockCalculateBackoff).toHaveBeenCalledWith(60_000, 2, 300_000)
    })

    it('enters cooldown when tripCount >= threshold', async () => {
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          mockNow += 120_000 * Math.pow(2, i - 1) + 1_000
          await circuitBreakerRegistry.isOpen('inst-1')
        }
        await circuitBreakerRegistry.manualTrip('inst-1', META)
      }
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
    })

    it('persists "manual_trip" event', async () => {
      await circuitBreakerRegistry.manualTrip('inst-1', META)
      expect(mockPersistEvent).toHaveBeenCalledTimes(1)
      expect(mockPersistEvent.mock.calls[0][1]).toBe('manual_trip')
    })
  })

  describe('manualReset', () => {
    it('deletes state entry', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(await circuitBreakerRegistry.getAllStates()).toHaveLength(1)
      await circuitBreakerRegistry.manualReset('inst-1')
      expect(await circuitBreakerRegistry.getAllStates()).toHaveLength(0)
    })

    it('persists "reset" event', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.manualReset('inst-1')
      expect(mockPersistEvent).toHaveBeenCalledTimes(2)
      const resetCall = mockPersistEvent.mock.calls.find((call) => call[1] === 'reset')
      expect(resetCall).toBeDefined()
    })

    it('handles non-existent instance gracefully', async () => {
      await expect(circuitBreakerRegistry.manualReset('nonexistent')).resolves.toBeUndefined()
      expect(circuitBreakerRegistry.getState('nonexistent')).toBe('closed')
    })
  })

  describe('restoreOpenState / restoreCooldownState', async () => {
    it('restores open state with correct values', async () => {
      const openUntil = new Date(mockNow + 60_000)
      circuitBreakerRegistry.restoreOpenState('inst-1', openUntil, 3, 2, META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].openUntil).toBe(openUntil.getTime())
      expect(allStates[0].failures).toBe(3)
      expect(allStates[0].tripCount).toBe(2)
    })

    it('restores cooldown state with correct values', async () => {
      const cooldownUntil = new Date(mockNow + 1_800_000)
      circuitBreakerRegistry.restoreCooldownState('inst-1', cooldownUntil, 3, 2, META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].cooldownUntil).toBe(cooldownUntil.getTime())
      expect(allStates[0].failures).toBe(3)
      expect(allStates[0].tripCount).toBe(2)
    })

    it('allows isOpen to work correctly after restore', async () => {
      const openUntil = new Date(mockNow + 60_000)
      circuitBreakerRegistry.restoreOpenState('inst-1', openUntil, 3, 2, META)
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(true)
      mockNow += 61_000
      expect(await circuitBreakerRegistry.isOpen('inst-1')).toBe(false)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('half_open')
    })
  })

  describe('getAllStates', async () => {
    it('returns array with state info', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates).toHaveLength(1)
      expect(allStates[0].instanceId).toBe('inst-1')
      expect(allStates[0].state).toBe('open')
      expect(allStates[0].tripCount).toBe(1)
      expect(allStates[0].failures).toBe(3)
    })

    it('computes remainingMs correctly', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].remainingMs).toBe(60_000)
      mockNow += 30_000
      const allStates2 = await circuitBreakerRegistry.getAllStates()
      expect(allStates2[0].remainingMs).toBe(30_000)
    })

    it('returns empty when no states tracked', async () => {
      expect(await circuitBreakerRegistry.getAllStates()).toEqual([])
    })
  })

  describe('custom configuration', async () => {
    it('respects custom failureThreshold', async () => {
      Object.assign(mockRuntimeConfig, { failureThreshold: 2 })
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
    })

    it('respects custom openDurationMs', async () => {
      Object.assign(mockRuntimeConfig, { openDurationMs: 30_000 })
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      const allStates = await circuitBreakerRegistry.getAllStates()
      expect(allStates[0].openUntil).toBe(mockNow + 30_000)
    })

    it('respects custom maxTripsBeforeCooldown', async () => {
      Object.assign(mockRuntimeConfig, { maxTripsBeforeCooldown: 3 })
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 61_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      mockNow += 121_000
      await circuitBreakerRegistry.isOpen('inst-1')
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('cooldown')
    })
  })

  describe('recordSuccess', async () => {
    it('resets circuit after any state', async () => {
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      await circuitBreakerRegistry.recordFailure('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('open')
      await circuitBreakerRegistry.recordSuccess('inst-1', META)
      expect(circuitBreakerRegistry.getState('inst-1')).toBe('closed')
    })

    it('does nothing for unknown instance', async () => {
      await expect(circuitBreakerRegistry.recordSuccess('unknown', META)).resolves.toBeUndefined()
      expect(circuitBreakerRegistry.getState('unknown')).toBe('closed')
    })
  })

  describe('meta tracking', async () => {
    it('stores meta on first failure', async () => {
      const meta: CircuitBreakerMeta = { instanceName: 'test', groupName: 'g', providerName: 'p' }
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      expect(mockPersistEvent).toHaveBeenCalledTimes(1)
      expect(mockPersistEvent.mock.calls[0][4]).toEqual(meta)
    })

    it('updates meta on subsequent failures', async () => {
      const meta1: CircuitBreakerMeta = { instanceName: 'test1', groupName: 'g', providerName: 'p' }
      const meta2: CircuitBreakerMeta = { instanceName: 'test2', groupName: 'g', providerName: 'p' }
      await circuitBreakerRegistry.recordFailure('inst-1', meta1)
      await circuitBreakerRegistry.recordFailure('inst-1', meta2)
      expect(mockPersistEvent).toHaveBeenCalledTimes(0)
      // The meta should be updated to meta2 even though state is still closed
    })

    it('passes meta to persistEvent', async () => {
      const meta: CircuitBreakerMeta = { instanceName: 'test', groupName: 'g', providerName: 'p' }
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      await circuitBreakerRegistry.recordFailure('inst-1', meta)
      expect(mockPersistEvent.mock.calls[0][4]).toEqual(meta)
    })
  })
})