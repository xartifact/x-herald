import { and, eq, gt, desc } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { circuitBreakerEvents } from '@/features/circuit-breaker/db';

export const CB_CONFIG_KEY = 'CIRCUIT_BREAKER_CONFIG';

export interface CircuitBreakerSettings {
  failureThreshold: number;
  openDurationMs: number;
  maxBackoffMs?: number;            // Maximum exponential backoff duration (default 300_000 = 5min)
  maxTripsBeforeCooldown?: number;  // Number of trips before entering cooldown (default 5)
  cooldownDurationMs?: number;      // Cooldown period duration (default 1_800_000 = 30min)
}

export interface CircuitBreakerMeta {
  instanceName: string;
  groupName: string;
  providerName: string;
}

const DEFAULT_CONFIG: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
};

let runtimeConfig: CircuitBreakerSettings = { ...DEFAULT_CONFIG };
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000;

function refreshConfigIfStale(): void {
  const now = Date.now();
  if (now - configLoadedAt < CONFIG_CACHE_TTL) return;
  configLoadedAt = now;

  import('@/features/gateway-config/service')
    .then(({ getConfig }) => getConfig<CircuitBreakerSettings | null>(CB_CONFIG_KEY, null))
    .then((stored) => { if (stored) runtimeConfig = stored; })
    .catch(() => {});
}

export function configureCircuitBreaker(settings: CircuitBreakerSettings): void {
  runtimeConfig = settings;
  configLoadedAt = Date.now();
  logger.info({ settings }, '[CircuitBreaker] Config updated');
}

// Safe accessors for optional config fields with defaults
function getMaxBackoffMs(): number {
  return runtimeConfig.maxBackoffMs ?? DEFAULT_CONFIG.maxBackoffMs!;
}

function getMaxTripsBeforeCooldown(): number {
  return runtimeConfig.maxTripsBeforeCooldown ?? DEFAULT_CONFIG.maxTripsBeforeCooldown!;
}

function getCooldownDurationMs(): number {
  return runtimeConfig.cooldownDurationMs ?? DEFAULT_CONFIG.cooldownDurationMs!;
}

/**
 * Calculate exponential backoff with jitter.
 * Formula: min(base × 2^(tripCount-1), max) × (0.8 + random × 0.4)
 * tripCount=1 returns base (no backoff for first trip).
 */
function calculateBackoff(baseMs: number, tripCount: number, maxMs: number): number {
  if (tripCount <= 1) return baseMs;
  const exponential = baseMs * Math.pow(2, tripCount - 1);
  const capped = Math.min(exponential, maxMs);
  const jitter = 0.8 + Math.random() * 0.4; // 0.8 ~ 1.2
  return Math.round(capped * jitter);
}

function persistEvent(
  instanceId: string,
  event: 'opened' | 'half_open' | 'closed' | 'cooldown' | 'reset' | 'manual_trip',
  failureCount: number,
  openUntil: Date | null,
  meta: CircuitBreakerMeta,
  tripCount?: number,
): void {
  import('@/core/db/client')
    .then(({ getDatabase }) => {
      const db = getDatabase();
      return import('@/features/circuit-breaker/db').then(({ circuitBreakerEvents }) =>
        db.insert(circuitBreakerEvents).values({
          instanceId,
          instanceName: meta.instanceName,
          groupName: meta.groupName,
          providerName: meta.providerName,
          event,
          failureCount,
          tripCount: tripCount ?? 0,
          openUntil: openUntil ?? undefined,
        })
      );
    })
    .catch((err) => logger.warn({ err, instanceId, event }, '[CircuitBreaker] Failed to persist event'));
}

interface InstanceState {
  failures: number;
  openUntil: number;
  state: 'closed' | 'open' | 'half_open' | 'cooldown';
  tripCount: number;        // Cumulative trip count for backoff calculation
  cooldownUntil: number;    // Timestamp when cooldown expires (0 if not in cooldown)
  pendingProbe: Promise<void> | null;  // Active half-open probe promise
  meta: CircuitBreakerMeta;
}

const EMPTY_META: CircuitBreakerMeta = { instanceName: '', groupName: '', providerName: '' };

class CircuitBreakerRegistry {
  private readonly states = new Map<string, InstanceState>();

  isOpen(instanceId: string): boolean {
    refreshConfigIfStale();

    const s = this.states.get(instanceId);
    if (!s || s.state === 'closed') return false;

    if (s.state === 'open' && Date.now() >= s.openUntil) {
      s.state = 'half_open';
      s.pendingProbe = null;
      persistEvent(instanceId, 'half_open', s.failures, null, s.meta, s.tripCount);
      return false;
    }

    if (s.state === 'cooldown' && Date.now() >= s.cooldownUntil) {
      // Cooldown expired → soft reset to half_open (tripCount=1, failures=0)
      s.state = 'half_open';
      s.cooldownUntil = 0;
      s.failures = 0;
      s.tripCount = 1; // Soft reset: give the instance a fresh chance
      s.pendingProbe = null;
      persistEvent(instanceId, 'half_open', 0, null, s.meta, s.tripCount);
      return false;
    }

    return s.state === 'open' || s.state === 'cooldown';
  }

  recordSuccess(instanceId: string, meta?: CircuitBreakerMeta): void {
    const s = this.states.get(instanceId);
    if (s) {
      logger.info(
        { instanceId, tripCount: s.tripCount, failures: s.failures },
        '[CircuitBreaker] Circuit reset on success',
      );
      persistEvent(instanceId, 'closed', s.failures, null, meta ?? s.meta, s.tripCount);
      this.states.delete(instanceId);
    }
  }

  recordFailure(instanceId: string, meta?: CircuitBreakerMeta): void {
    refreshConfigIfStale();

    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', tripCount: 0, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;

    if (s.state === 'half_open') {
      // half_open failure → go back to open with incremented tripCount, NO failure reset
      s.tripCount++;
      if (s.tripCount >= getMaxTripsBeforeCooldown()) {
        // Enter cooldown
        s.state = 'cooldown';
        s.cooldownUntil = Date.now() + getCooldownDurationMs();
        const cooldownUntilDate = new Date(s.cooldownUntil);
        logger.warn(
          { instanceId, failures: s.failures, tripCount: s.tripCount, cooldownUntil: cooldownUntilDate.toISOString() },
          '[CircuitBreaker] Cooldown entered',
        );
        persistEvent(instanceId, 'cooldown', s.failures, null, s.meta, s.tripCount);
      } else {
        // Normal open with exponential backoff
        const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
        s.state = 'open';
        s.openUntil = Date.now() + backoffMs;
        const openUntilDate = new Date(s.openUntil);
        logger.warn(
          { instanceId, failures: s.failures, tripCount: s.tripCount, backoffMs },
          '[CircuitBreaker] Circuit opened (re-trip)',
        );
        persistEvent(instanceId, 'opened', s.failures, openUntilDate, s.meta, s.tripCount);
      }
      s.pendingProbe = null;
      return;
    }

    if (s.state === 'open') {
      // Already open — do not extend openUntil (keep original sentence)
      return;
    }

    if (s.state === 'cooldown') {
      // Already in cooldown — do not modify
      return;
    }

    // Closed state — accumulate failures
    s.failures++;

    if (s.failures >= runtimeConfig.failureThreshold) {
      // First trip
      s.tripCount = 1;
      s.state = 'open';
      s.openUntil = Date.now() + runtimeConfig.openDurationMs;
      const openUntilDate = new Date(s.openUntil);
      logger.warn(
        { instanceId, failures: s.failures, tripCount: 1 },
        '[CircuitBreaker] Circuit opened',
      );
      persistEvent(instanceId, 'opened', s.failures, openUntilDate, s.meta, s.tripCount);
    }
  }

  restoreOpenState(instanceId: string, openUntil: Date, failureCount: number, tripCount: number = 0, meta?: CircuitBreakerMeta): void {
    const openUntilMs = openUntil.getTime();
    this.states.set(instanceId, {
      failures: failureCount,
      openUntil: openUntilMs,
      state: 'open',
      tripCount,
      cooldownUntil: 0,
      pendingProbe: null,
      meta: meta ?? EMPTY_META,
    });
    logger.info(
      { instanceId, openUntil: openUntil.toISOString(), failureCount, tripCount },
      '[CircuitBreaker] Restored open state from DB',
    );
  }

  restoreCooldownState(instanceId: string, cooldownUntil: Date, failureCount: number, tripCount: number = 0, meta?: CircuitBreakerMeta): void {
    const cooldownUntilMs = cooldownUntil.getTime();
    this.states.set(instanceId, {
      failures: failureCount,
      openUntil: 0,
      state: 'cooldown',
      tripCount,
      cooldownUntil: cooldownUntilMs,
      pendingProbe: null,
      meta: meta ?? EMPTY_META,
    });
    logger.info(
      { instanceId, cooldownUntil: cooldownUntil.toISOString(), failureCount, tripCount },
      '[CircuitBreaker] Restored cooldown state from DB',
    );
  }

  getState(instanceId: string): 'closed' | 'open' | 'half_open' | 'cooldown' {
    return this.states.get(instanceId)?.state ?? 'closed';
  }

  /**
   * Manual reset: return instance to closed state, clear all counters.
   */
  manualReset(instanceId: string): void {
    const s = this.states.get(instanceId);
    if (s) {
      persistEvent(instanceId, 'reset', s.failures, null, s.meta, s.tripCount);
      this.states.delete(instanceId);
      logger.info({ instanceId }, '[CircuitBreaker] Manual reset');
    } else {
      logger.info({ instanceId }, '[CircuitBreaker] Manual reset (no state to reset)');
    }
  }

  /**
   * Manual trip: force instance into open state with incremented tripCount.
   */
  manualTrip(instanceId: string, meta?: CircuitBreakerMeta): void {
    refreshConfigIfStale();

    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', tripCount: 0, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;

    // Increment trip count and apply backoff
    s.tripCount++;
    const willCooldown = s.tripCount >= getMaxTripsBeforeCooldown();

    if (willCooldown) {
      s.state = 'cooldown';
      s.cooldownUntil = Date.now() + getCooldownDurationMs();
      const cooldownUntilDate = new Date(s.cooldownUntil);
      persistEvent(instanceId, 'manual_trip', s.failures, null, s.meta, s.tripCount);
    } else {
      const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
      s.state = 'open';
      s.openUntil = Date.now() + backoffMs;
      const openUntilDate = new Date(s.openUntil);
      persistEvent(instanceId, 'manual_trip', s.failures, openUntilDate, s.meta, s.tripCount);
    }
    s.pendingProbe = null;
    logger.warn({ instanceId, tripCount: s.tripCount }, '[CircuitBreaker] Manual trip');
  }

  /**
   * Get snapshot of all instance states.
   */
  getAllStates(): Array<{
    instanceId: string;
    state: 'closed' | 'open' | 'half_open' | 'cooldown';
    tripCount: number;
    failures: number;
    remainingMs: number;
    openUntil: number;
    cooldownUntil: number;
  }> {
    refreshConfigIfStale();
    const result = [];
    for (const [instanceId, s] of this.states.entries()) {
      let remainingMs = 0;
      if (s.state === 'open' && s.openUntil > 0) {
        remainingMs = Math.max(0, s.openUntil - Date.now());
      }
      if (s.state === 'cooldown' && s.cooldownUntil > 0) {
        remainingMs = Math.max(0, s.cooldownUntil - Date.now());
      }
      result.push({
        instanceId,
        state: s.state,
        tripCount: s.tripCount,
        failures: s.failures,
        remainingMs,
        openUntil: s.openUntil,
        cooldownUntil: s.cooldownUntil,
      });
    }
    return result;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export async function recoverCircuitBreakerState(): Promise<void> {
  try {
    const db = getDatabase();

    // Recover open states (most recent opened event per instance)
    const openedEvents = await db
      .select()
      .from(circuitBreakerEvents)
      .where(
        and(
          eq(circuitBreakerEvents.event, 'opened'),
          gt(circuitBreakerEvents.openUntil, new Date()),
        ),
      )
      .orderBy(desc(circuitBreakerEvents.createdAt));

    const latestOpened = new Map<string, typeof openedEvents[0]>();
    for (const event of openedEvents) {
      if (!latestOpened.has(event.instanceId)) {
        latestOpened.set(event.instanceId, event);
      }
    }

    for (const [instanceId, event] of latestOpened) {
      if (event.openUntil) {
        const meta: CircuitBreakerMeta = {
          instanceName: event.instanceName,
          groupName: event.groupName,
          providerName: event.providerName,
        };
        circuitBreakerRegistry.restoreOpenState(instanceId, event.openUntil, event.failureCount, event.tripCount ?? 0, meta);
      }
    }

    // Recover cooldown states (most recent cooldown event per instance)
    const cooldownEvents = await db
      .select()
      .from(circuitBreakerEvents)
      .where(
        and(
          eq(circuitBreakerEvents.event, 'cooldown'),
          gt(circuitBreakerEvents.cooldownUntil, new Date()),
        ),
      )
      .orderBy(desc(circuitBreakerEvents.createdAt));

    const latestCooldown = new Map<string, typeof cooldownEvents[0]>();
    for (const event of cooldownEvents) {
      if (!latestCooldown.has(event.instanceId)) {
        latestCooldown.set(event.instanceId, event);
      }
    }

    for (const [instanceId, event] of latestCooldown) {
      // Only restore cooldown if there's no later 'opened' event
      if (!latestOpened.has(instanceId) && event.cooldownUntil) {
        const meta: CircuitBreakerMeta = {
          instanceName: event.instanceName,
          groupName: event.groupName,
          providerName: event.providerName,
        };
        circuitBreakerRegistry.restoreCooldownState(instanceId, event.cooldownUntil, event.failureCount, event.tripCount ?? 0, meta);
      }
    }

    logger.info(
      { opened: latestOpened.size, cooldown: latestCooldown.size },
      '[CircuitBreaker] Recovered circuit breakers from DB',
    );
  } catch (err) {
    logger.warn({ err }, '[CircuitBreaker] Failed to recover circuit breaker state from DB, skipping');
  }
}
