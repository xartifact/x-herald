import { describe, it, expect } from 'bun:test';

import { calculateScore } from '../rank-calculator';

describe('Rank Calculator', () => {
  describe('calculateScore', () => {
    it('cold start: requestCount=0 returns 0', () => {
      const score = calculateScore(0, new Date('2024-01-10'));
      expect(score).toBe(0);
    });

    it('cold start: negative requestCount returns 0', () => {
      const score = calculateScore(-5, new Date('2024-01-10'));
      expect(score).toBe(0);
    });

    it('recent: 100 requests today returns 100', () => {
      const lastRequest = new Date('2024-01-10T12:00:00Z');
      const now = new Date('2024-01-10T12:00:00Z');
      const score = calculateScore(100, lastRequest, now);
      expect(score).toBe(100);
    });

    it('7-day decay: 100 requests 7 days ago returns ~50', () => {
      const lastRequest = new Date('2024-01-03T12:00:00Z');
      const now = new Date('2024-01-10T12:00:00Z');
      const score = calculateScore(100, lastRequest, now);
      // Score halves every 7 days: 100 * 0.5 = 50
      expect(score).toBeCloseTo(50, 1);
    });

    it('14-day decay: 100 requests 14 days ago returns ~25', () => {
      const lastRequest = new Date('2023-12-27T12:00:00Z');
      const now = new Date('2024-01-10T12:00:00Z');
      const score = calculateScore(100, lastRequest, now);
      // Score halves every 7 days: 100 * 0.25 = 25
      expect(score).toBeCloseTo(25, 1);
    });

    it('minimum floor: 1 request 100 days ago returns 0.001', () => {
      const lastRequest = new Date('2023-10-02T12:00:00Z');
      const now = new Date('2024-01-10T12:00:00Z');
      const score = calculateScore(1, lastRequest, now);
      // Raw score would be ~0.00005, but MIN_SCORE_FLOOR = 0.001
      expect(score).toBe(0.001);
    });

    it('future timestamp is handled (no negative days)', () => {
      const lastRequest = new Date('2024-01-15T12:00:00Z');
      const now = new Date('2024-01-10T12:00:00Z');
      const score = calculateScore(100, lastRequest, now);
      // Should treat as 0 days (Math.max prevents negative)
      expect(score).toBe(100);
    });
  });
});
