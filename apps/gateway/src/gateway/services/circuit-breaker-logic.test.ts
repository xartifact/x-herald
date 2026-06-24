import { describe, it, expect } from 'bun:test';

import { decideStateTransition } from './circuit-breaker-logic';

const BASE_CONFIG = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
};

const NOW = 1_000_000_000_000;

describe('decideStateTransition', () => {
  describe('CLOSED state', () => {
    it('stays closed when failures < threshold', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 2,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('closed');
      expect(decision.shouldFailover).toBe(false);
      expect(decision.reason).toBeNull();
    });

    it('transitions to open when failures reach threshold', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 3,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 60_000);
      expect(decision.tripCount).toBe(1);
      expect(decision.shouldFailover).toBe(true);
      expect(decision.reason).toBe('failure_threshold_reached');
    });

    it('transitions to open when failures exceed threshold', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 5,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 60_000);
      expect(decision.tripCount).toBe(1);
    });
  });

  describe('OPEN state', () => {
    it('transitions to half_open when now >= openUntil', () => {
      const decision = decideStateTransition({
        currentState: 'open',
        currentFailures: 3,
        currentTripCount: 1,
        currentOpenUntil: NOW + 60_000,
        currentCooldownUntil: 0,
        now: NOW + 60_001,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('half_open');
      expect(decision.shouldFailover).toBe(false);
      expect(decision.tripCount).toBe(1);
    });

    it('stays open when now < openUntil', () => {
      const decision = decideStateTransition({
        currentState: 'open',
        currentFailures: 3,
        currentTripCount: 1,
        currentOpenUntil: NOW + 60_000,
        currentCooldownUntil: 0,
        now: NOW + 30_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.shouldFailover).toBe(true);
      expect(decision.openUntil).toBe(NOW + 60_000);
    });

    it('preserves openUntil when staying open', () => {
      const decision = decideStateTransition({
        currentState: 'open',
        currentFailures: 3,
        currentTripCount: 2,
        currentOpenUntil: NOW + 120_000,
        currentCooldownUntil: 0,
        now: NOW + 50_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 120_000);
      expect(decision.tripCount).toBe(2);
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions to open with base backoff on first re-trip', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 1,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 60_000);
      expect(decision.reason).toBe('probe_failed');
      expect(decision.shouldFailover).toBe(true);
    });

    it('transitions to open with exponential backoff on second re-trip', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 2,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 120_000);
    });

    it('transitions to open with exponential backoff on third re-trip', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 3,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 240_000);
    });

    it('caps backoff at maxBackoffMs', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 4,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 300_000);
    });

    it('transitions to cooldown when tripCount reaches maxTripsBeforeCooldown', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('cooldown');
      expect(decision.cooldownUntil).toBe(NOW + 1_800_000);
      expect(decision.reason).toBe('max_trips_reached');
      expect(decision.shouldFailover).toBe(true);
    });

    it('transitions to cooldown when tripCount exceeds maxTripsBeforeCooldown', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 6,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('cooldown');
      expect(decision.cooldownUntil).toBe(NOW + 1_800_000);
    });
  });

  describe('COOLDOWN state', () => {
    it('transitions to half_open when now >= cooldownUntil', () => {
      const decision = decideStateTransition({
        currentState: 'cooldown',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: NOW + 1_800_000,
        now: NOW + 1_800_001,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('half_open');
      expect(decision.tripCount).toBe(1);
      expect(decision.shouldFailover).toBe(false);
      expect(decision.cooldownUntil).toBe(0);
    });

    it('stays in cooldown when now < cooldownUntil', () => {
      const decision = decideStateTransition({
        currentState: 'cooldown',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: NOW + 1_800_000,
        now: NOW + 900_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('cooldown');
      expect(decision.cooldownUntil).toBe(NOW + 1_800_000);
      expect(decision.shouldFailover).toBe(true);
    });

    it('preserves cooldownUntil when staying in cooldown', () => {
      const decision = decideStateTransition({
        currentState: 'cooldown',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: NOW + 2_000_000,
        now: NOW + 1_000_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('cooldown');
      expect(decision.cooldownUntil).toBe(NOW + 2_000_000);
      expect(decision.tripCount).toBe(5);
    });
  });

  describe('custom configuration', () => {
    it('respects custom failureThreshold', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 2,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
        failureThreshold: 2,
      });
      expect(decision.nextState).toBe('open');
      expect(decision.openUntil).toBe(NOW + 60_000);
    });

    it('respects custom openDurationMs', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 3,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
        openDurationMs: 30_000,
      });
      expect(decision.openUntil).toBe(NOW + 30_000);
    });

    it('respects custom maxTripsBeforeCooldown', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 3,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
        maxTripsBeforeCooldown: 3,
      });
      expect(decision.nextState).toBe('cooldown');
    });

    it('respects custom cooldownDurationMs', () => {
      const decision = decideStateTransition({
        currentState: 'half_open',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
        cooldownDurationMs: 900_000,
      });
      expect(decision.nextState).toBe('cooldown');
      expect(decision.cooldownUntil).toBe(NOW + 900_000);
    });
  });

  describe('edge cases', () => {
    it('handles zero failures in closed state', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 0,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('closed');
      expect(decision.shouldFailover).toBe(false);
    });

    it('handles exactly threshold minus one failures', () => {
      const decision = decideStateTransition({
        currentState: 'closed',
        currentFailures: 2,
        currentTripCount: 0,
        currentOpenUntil: 0,
        currentCooldownUntil: 0,
        now: NOW,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('closed');
    });

    it('handles boundary at exactly openUntil', () => {
      const decision = decideStateTransition({
        currentState: 'open',
        currentFailures: 3,
        currentTripCount: 1,
        currentOpenUntil: NOW + 60_000,
        currentCooldownUntil: 0,
        now: NOW + 60_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('half_open');
    });

    it('handles boundary at exactly cooldownUntil', () => {
      const decision = decideStateTransition({
        currentState: 'cooldown',
        currentFailures: 3,
        currentTripCount: 5,
        currentOpenUntil: 0,
        currentCooldownUntil: NOW + 1_800_000,
        now: NOW + 1_800_000,
        ...BASE_CONFIG,
      });
      expect(decision.nextState).toBe('half_open');
    });
  });
});
