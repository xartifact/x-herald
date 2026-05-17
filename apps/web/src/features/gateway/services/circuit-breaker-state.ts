import { and, eq, gt, desc } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { circuitBreakerEvents } from '@/features/circuit-breaker/db';

import {
  runtimeConfig,
  refreshConfigIfStale,
  calculateBackoff,
  persistEvent,
  getMaxBackoffMs,
  getMaxTripsBeforeCooldown,
  getCooldownDurationMs,
} from './circuit-breaker-policy';
import type { CircuitBreakerMeta } from './circuit-breaker-policy';

interface InstanceState {
  failures: number;
  openUntil: number;
  state: 'closed' | 'open' | 'half_open' | 'cooldown';
  tripCount: number;
  cooldownUntil: number;
  pendingProbe: Promise<void> | null;
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
      s.state = 'half_open';
      s.cooldownUntil = 0;
      s.failures = 0;
      s.tripCount = 1;
      s.pendingProbe = null;
      persistEvent(instanceId, 'half_open', 0, null, s.meta, s.tripCount);
      return false;
    }

    return s.state === 'open' || s.state === 'cooldown';
  }

  recordSuccess(instanceId: string, meta?: CircuitBreakerMeta): void {
    const s = this.states.get(instanceId);
    if (s) {
      logger.info({ instanceId, tripCount: s.tripCount, failures: s.failures }, '[CircuitBreaker] Circuit reset on success');
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
      s.tripCount++;
      if (s.tripCount >= getMaxTripsBeforeCooldown()) {
        s.state = 'cooldown';
        s.cooldownUntil = Date.now() + getCooldownDurationMs();
        logger.warn({ instanceId, failures: s.failures, tripCount: s.tripCount }, '[CircuitBreaker] Cooldown entered');
        persistEvent(instanceId, 'cooldown', s.failures, null, s.meta, s.tripCount);
      } else {
        const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
        s.state = 'open';
        s.openUntil = Date.now() + backoffMs;
        logger.warn({ instanceId, failures: s.failures, tripCount: s.tripCount, backoffMs }, '[CircuitBreaker] Circuit opened (re-trip)');
        persistEvent(instanceId, 'opened', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
      }
      s.pendingProbe = null;
      return;
    }

    if (s.state === 'open' || s.state === 'cooldown') return;

    s.failures++;
    if (s.failures >= runtimeConfig.failureThreshold) {
      s.tripCount = 1;
      s.state = 'open';
      s.openUntil = Date.now() + runtimeConfig.openDurationMs;
      logger.warn({ instanceId, failures: s.failures, tripCount: 1 }, '[CircuitBreaker] Circuit opened');
      persistEvent(instanceId, 'opened', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
    }
  }

  restoreOpenState(instanceId: string, openUntil: Date, failureCount: number, tripCount = 0, meta?: CircuitBreakerMeta): void {
    this.states.set(instanceId, { failures: failureCount, openUntil: openUntil.getTime(), state: 'open', tripCount, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META });
    logger.info({ instanceId, openUntil: openUntil.toISOString(), failureCount, tripCount }, '[CircuitBreaker] Restored open state from DB');
  }

  restoreCooldownState(instanceId: string, cooldownUntil: Date, failureCount: number, tripCount = 0, meta?: CircuitBreakerMeta): void {
    this.states.set(instanceId, { failures: failureCount, openUntil: 0, state: 'cooldown', tripCount, cooldownUntil: cooldownUntil.getTime(), pendingProbe: null, meta: meta ?? EMPTY_META });
    logger.info({ instanceId, cooldownUntil: cooldownUntil.toISOString(), failureCount, tripCount }, '[CircuitBreaker] Restored cooldown state from DB');
  }

  getState(instanceId: string): 'closed' | 'open' | 'half_open' | 'cooldown' {
    return this.states.get(instanceId)?.state ?? 'closed';
  }

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

  manualTrip(instanceId: string, meta?: CircuitBreakerMeta): void {
    refreshConfigIfStale();
    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', tripCount: 0, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;
    s.tripCount++;

    if (s.tripCount >= getMaxTripsBeforeCooldown()) {
      s.state = 'cooldown';
      s.cooldownUntil = Date.now() + getCooldownDurationMs();
      persistEvent(instanceId, 'manual_trip', s.failures, null, s.meta, s.tripCount);
    } else {
      const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
      s.state = 'open';
      s.openUntil = Date.now() + backoffMs;
      persistEvent(instanceId, 'manual_trip', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
    }
    s.pendingProbe = null;
    logger.warn({ instanceId, tripCount: s.tripCount }, '[CircuitBreaker] Manual trip');
  }

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
      if (s.state === 'open' && s.openUntil > 0) remainingMs = Math.max(0, s.openUntil - Date.now());
      if (s.state === 'cooldown' && s.cooldownUntil > 0) remainingMs = Math.max(0, s.cooldownUntil - Date.now());
      result.push({ instanceId, state: s.state, tripCount: s.tripCount, failures: s.failures, remainingMs, openUntil: s.openUntil, cooldownUntil: s.cooldownUntil });
    }
    return result;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export async function recoverCircuitBreakerState(): Promise<void> {
  try {
    const db = getDatabase();

    const openedEvents = await db
      .select()
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'opened'), gt(circuitBreakerEvents.openUntil, new Date())))
      .orderBy(desc(circuitBreakerEvents.createdAt));

    const latestOpened = new Map<string, typeof openedEvents[0]>();
    for (const event of openedEvents) {
      if (!latestOpened.has(event.instanceId)) latestOpened.set(event.instanceId, event);
    }
    for (const [instanceId, event] of latestOpened) {
      if (event.openUntil) {
        const meta: CircuitBreakerMeta = { instanceName: event.instanceName, groupName: event.groupName, providerName: event.providerName };
        circuitBreakerRegistry.restoreOpenState(instanceId, event.openUntil, event.failureCount, event.tripCount ?? 0, meta);
      }
    }

    const cooldownEvents = await db
      .select()
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'cooldown'), gt(circuitBreakerEvents.cooldownUntil, new Date())))
      .orderBy(desc(circuitBreakerEvents.createdAt));

    const latestCooldown = new Map<string, typeof cooldownEvents[0]>();
    for (const event of cooldownEvents) {
      if (!latestCooldown.has(event.instanceId)) latestCooldown.set(event.instanceId, event);
    }
    for (const [instanceId, event] of latestCooldown) {
      if (!latestOpened.has(instanceId) && event.cooldownUntil) {
        const meta: CircuitBreakerMeta = { instanceName: event.instanceName, groupName: event.groupName, providerName: event.providerName };
        circuitBreakerRegistry.restoreCooldownState(instanceId, event.cooldownUntil, event.failureCount, event.tripCount ?? 0, meta);
      }
    }

    logger.info({ opened: latestOpened.size, cooldown: latestCooldown.size }, '[CircuitBreaker] Recovered circuit breakers from DB');
  } catch (err) {
    logger.warn({ err }, '[CircuitBreaker] Failed to recover circuit breaker state from DB, skipping');
  }
}
