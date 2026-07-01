import { and, eq, gt, desc } from '@xartifact/x-llm-gateway-db';

import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import { circuitBreakerEvents } from '@xartifact/x-llm-gateway-db';

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
import { decideStateTransition } from './circuit-breaker-logic';

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
  private now: () => number;

  constructor(now?: () => number) {
    this.now = now ?? (() => Date.now());
  }

  async isOpen(instanceId: string): Promise<boolean> {
    await refreshConfigIfStale(this.now);
    const s = this.states.get(instanceId);
    if (!s || s.state === 'closed' || s.state === 'half_open') return false;

    const decision = decideStateTransition({
      currentState: s.state,
      currentFailures: s.failures,
      currentTripCount: s.tripCount,
      currentOpenUntil: s.openUntil,
      currentCooldownUntil: s.cooldownUntil,
      now: this.now(),
      failureThreshold: runtimeConfig.failureThreshold,
      openDurationMs: runtimeConfig.openDurationMs,
      maxBackoffMs: getMaxBackoffMs(),
      maxTripsBeforeCooldown: getMaxTripsBeforeCooldown(),
      cooldownDurationMs: getCooldownDurationMs(),
    });

    if (decision.nextState !== s.state) {
      const originalState = s.state;
      s.state = decision.nextState;
      s.openUntil = decision.openUntil;
      s.cooldownUntil = decision.cooldownUntil;
      s.tripCount = decision.tripCount;
      s.pendingProbe = null;
      if (originalState === 'cooldown') {
        s.failures = 0;
      }
      await persistEvent(instanceId, 'half_open', s.failures, null, s.meta, s.tripCount);
      return false;
    }

    return s.state === 'open' || s.state === 'cooldown';
  }

  async recordSuccess(instanceId: string, meta?: CircuitBreakerMeta): Promise<void> {
    const s = this.states.get(instanceId);
    if (s) {
      logger.info({ instanceId, tripCount: s.tripCount, failures: s.failures }, '[CircuitBreaker] Circuit reset on success');
      await persistEvent(instanceId, 'closed', s.failures, null, meta ?? s.meta, s.tripCount);
      this.states.delete(instanceId);
    }
  }

  async recordFailure(instanceId: string, meta?: CircuitBreakerMeta): Promise<void> {
    await refreshConfigIfStale(this.now);
    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', tripCount: 0, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;

    if (s.state === 'half_open') {
      s.tripCount++;
      const decision = decideStateTransition({
        currentState: s.state,
        currentFailures: s.failures,
        currentTripCount: s.tripCount,
        currentOpenUntil: s.openUntil,
        currentCooldownUntil: s.cooldownUntil,
        now: this.now(),
        failureThreshold: runtimeConfig.failureThreshold,
        openDurationMs: runtimeConfig.openDurationMs,
        maxBackoffMs: getMaxBackoffMs(),
        maxTripsBeforeCooldown: getMaxTripsBeforeCooldown(),
        cooldownDurationMs: getCooldownDurationMs(),
      });

      s.state = decision.nextState;
      s.cooldownUntil = decision.cooldownUntil;
      s.pendingProbe = null;

      if (decision.nextState === 'open') {
        const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
        s.openUntil = this.now() + backoffMs;
        logger.warn({ instanceId, failures: s.failures, tripCount: s.tripCount, backoffMs }, '[CircuitBreaker] Circuit opened (re-trip)');
        await persistEvent(instanceId, 'opened', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
      } else {
        s.openUntil = 0;
        logger.warn({ instanceId, failures: s.failures, tripCount: s.tripCount }, '[CircuitBreaker] Cooldown entered');
        await persistEvent(instanceId, 'cooldown', s.failures, null, s.meta, s.tripCount);
      }
      return;
    }

    if (s.state === 'open' || s.state === 'cooldown') return;

    s.failures++;
    const decision = decideStateTransition({
      currentState: s.state,
      currentFailures: s.failures,
      currentTripCount: s.tripCount,
      currentOpenUntil: s.openUntil,
      currentCooldownUntil: s.cooldownUntil,
      now: this.now(),
      failureThreshold: runtimeConfig.failureThreshold,
      openDurationMs: runtimeConfig.openDurationMs,
      maxBackoffMs: getMaxBackoffMs(),
      maxTripsBeforeCooldown: getMaxTripsBeforeCooldown(),
      cooldownDurationMs: getCooldownDurationMs(),
    });

    s.state = decision.nextState;
    s.openUntil = decision.openUntil;
    s.cooldownUntil = decision.cooldownUntil;
    s.tripCount = decision.tripCount;

    if (decision.nextState === 'open') {
      logger.warn({ instanceId, failures: s.failures, tripCount: s.tripCount }, '[CircuitBreaker] Circuit opened');
      await persistEvent(instanceId, 'opened', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
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

  async manualReset(instanceId: string): Promise<void> {
    const s = this.states.get(instanceId);
    if (s) {
      await persistEvent(instanceId, 'reset', s.failures, null, s.meta, s.tripCount);
      this.states.delete(instanceId);
      logger.info({ instanceId }, '[CircuitBreaker] Manual reset');
    } else {
      logger.info({ instanceId }, '[CircuitBreaker] Manual reset (no state to reset)');
    }
  }

  async manualTrip(instanceId: string, meta?: CircuitBreakerMeta): Promise<void> {
    await refreshConfigIfStale(this.now);
    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', tripCount: 0, cooldownUntil: 0, pendingProbe: null, meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;
    s.tripCount++;

    const decision = decideStateTransition({
      currentState: 'half_open',
      currentFailures: s.failures,
      currentTripCount: s.tripCount,
      currentOpenUntil: s.openUntil,
      currentCooldownUntil: s.cooldownUntil,
      now: this.now(),
      failureThreshold: runtimeConfig.failureThreshold,
      openDurationMs: runtimeConfig.openDurationMs,
      maxBackoffMs: getMaxBackoffMs(),
      maxTripsBeforeCooldown: getMaxTripsBeforeCooldown(),
      cooldownDurationMs: getCooldownDurationMs(),
    });

    s.state = decision.nextState;
    s.cooldownUntil = decision.cooldownUntil;
    s.pendingProbe = null;

    if (decision.nextState === 'open') {
      const backoffMs = calculateBackoff(runtimeConfig.openDurationMs, s.tripCount, getMaxBackoffMs());
      s.openUntil = this.now() + backoffMs;
      await persistEvent(instanceId, 'manual_trip', s.failures, new Date(s.openUntil), s.meta, s.tripCount);
    } else {
      s.openUntil = 0;
      await persistEvent(instanceId, 'manual_trip', s.failures, null, s.meta, s.tripCount);
    }
    logger.warn({ instanceId, tripCount: s.tripCount }, '[CircuitBreaker] Manual trip');
  }

  reset(): void {
    this.states.clear();
  }

  async getAllStates(): Promise<Array<{
    instanceId: string;
    state: 'closed' | 'open' | 'half_open' | 'cooldown';
    tripCount: number;
    failures: number;
    remainingMs: number;
    openUntil: number;
    cooldownUntil: number;
  }>> {
    await refreshConfigIfStale(this.now);
    const result = [];
    for (const [instanceId, s] of this.states.entries()) {
      let remainingMs = 0;
      if (s.state === 'open' && s.openUntil > 0) remainingMs = Math.max(0, s.openUntil - this.now());
      if (s.state === 'cooldown' && s.cooldownUntil > 0) remainingMs = Math.max(0, s.cooldownUntil - this.now());
      result.push({ instanceId, state: s.state, tripCount: s.tripCount, failures: s.failures, remainingMs, openUntil: s.openUntil, cooldownUntil: s.cooldownUntil });
    }
    return result;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export async function recoverCircuitBreakerState(now: () => number = () => Date.now()): Promise<void> {
  await refreshConfigIfStale(now);
  try {
    const db = getDatabase();

    const openedEvents = await db
      .select()
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'opened'), gt(circuitBreakerEvents.openUntil, new Date(now()))))
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
      .where(and(eq(circuitBreakerEvents.event, 'cooldown'), gt(circuitBreakerEvents.cooldownUntil, new Date(now()))))
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
