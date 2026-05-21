/**
 * Retry status codes configuration tests
 *
 * Tests the default retryableStatusCodes array and the nullish coalescing
 * logic used in chat-completion-handler.ts line 359:
 *
 *   const retryableStatusCodes = retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 504, 521, 524];
 */

import { describe, expect, it } from 'bun:test';

/**
 * Mirrors the default array from chat-completion-handler.ts.
 * Must be kept in sync with the source.
 */
const DEFAULT_RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504, 521, 524] as const;

/**
 * Reproduces the resolution logic from the handler:
 *   const retryableStatusCodes = retryConfig?.retryableStatusCodes ?? DEFAULT;
 */
function resolveRetryableStatusCodes(
  retryConfig?: { retryableStatusCodes?: number[] } | null,
): number[] {
  return retryConfig?.retryableStatusCodes ?? [...DEFAULT_RETRYABLE_STATUS_CODES];
}

describe('retryableStatusCodes', () => {
  // ── 1. Default array contains 524 ──────────────────────────────────────

  describe('default array includes 524', () => {
    it('contains HTTP 524 (Cloudflare A Timeout Occurred) in the default list', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes).toContain(524);
    });

    it('contains 524 at the last position in the default array', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes[codes.length - 1]).toBe(524);
    });
  });

  // ── 2. Default array includes all expected codes ───────────────────────

  describe('default array includes all original codes', () => {
    it('contains every expected status code', () => {
      const codes = resolveRetryableStatusCodes();
      const expected = [429, 500, 502, 503, 504, 521, 524];

      expect(codes).toEqual(expected);
    });

    it('has exactly 7 entries — no accidental additions or removals', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes.length).toBe(7);
    });

    it('includes all standard server error codes (500-504)', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes).toContain(500);
      expect(codes).toContain(502);
      expect(codes).toContain(503);
      expect(codes).toContain(504);
    });

    it('includes rate-limit code 429', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes).toContain(429);
    });

    it('includes Cloudflare-specific codes (521, 524)', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes).toContain(521);
      expect(codes).toContain(524);
    });
  });

  // ── 3. Custom retryConfig overrides the default ────────────────────────

  describe('custom retryableStatusCodes override', () => {
    it('uses custom codes when provided — does NOT include 524', () => {
      const codes = resolveRetryableStatusCodes({
        retryableStatusCodes: [500, 502],
      });

      expect(codes).toEqual([500, 502]);
      expect(codes).not.toContain(524);
    });

    it('uses custom codes when provided — full replacement', () => {
      const customCodes = [429, 503];
      const codes = resolveRetryableStatusCodes({
        retryableStatusCodes: customCodes,
      });

      expect(codes).toBe(customCodes);
    });

    it('falls back to default when retryableStatusCodes is undefined', () => {
      const codes = resolveRetryableStatusCodes({ retryableStatusCodes: undefined });

      expect(codes).toEqual([429, 500, 502, 503, 504, 521, 524]);
    });

    it('falls back to default when retryConfig is null', () => {
      const codes = resolveRetryableStatusCodes(null);

      expect(codes).toEqual([429, 500, 502, 503, 504, 521, 524]);
    });

    it('falls back to default when retryConfig is undefined', () => {
      const codes = resolveRetryableStatusCodes(undefined);

      expect(codes).toEqual([429, 500, 502, 503, 504, 521, 524]);
    });

    it('allows an empty array override (disables all retries)', () => {
      const codes = resolveRetryableStatusCodes({
        retryableStatusCodes: [],
      });

      expect(codes).toEqual([]);
      expect(codes.length).toBe(0);
    });
  });

  // ── 4. Boundary / adversarial cases ────────────────────────────────────

  describe('boundary and adversarial cases', () => {
    it('rejects non-retryable status codes not in default (e.g. 400, 401)', () => {
      const codes = resolveRetryableStatusCodes();

      expect(codes).not.toContain(400);
      expect(codes).not.toContain(401);
      expect(codes).not.toContain(403);
      expect(codes).not.toContain(404);
      expect(codes).not.toContain(418);
    });

    it('default array contains only unique values (no duplicates)', () => {
      const codes = resolveRetryableStatusCodes();
      const unique = new Set(codes);

      expect(unique.size).toBe(codes.length);
    });

    it('default array values are all in the valid HTTP status code range', () => {
      const codes = resolveRetryableStatusCodes();

      for (const code of codes) {
        expect(code).toBeGreaterThanOrEqual(400);
        expect(code).toBeLessThanOrEqual(599);
      }
    });

    it('custom codes with unusual but valid values are preserved', () => {
      const codes = resolveRetryableStatusCodes({
        retryableStatusCodes: [520, 522, 523, 524, 525, 526, 530],
      });

      expect(codes).toEqual([520, 522, 523, 524, 525, 526, 530]);
    });
  });
});
