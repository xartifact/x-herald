import { describe, it, expect } from 'bun:test';
import {
  extractPerformanceMetrics,
  extractErrorInfo,
  extractBusinessTags,
} from './performance-extractor';

describe('extractPerformanceMetrics', () => {
  it('returns fast tier for responseTimeMs < 1000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 500 });
    expect(result).toEqual({
      responseTimeTier: 'fast',
      gatewayOverheadMs: undefined,
      providerTtfbMs: undefined,
      streamDurationMs: undefined,
    });
  });

  it('returns normal tier for responseTimeMs = 1000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 1000 });
    expect(result?.responseTimeTier).toBe('normal');
  });

  it('returns normal tier for responseTimeMs < 5000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 2500 });
    expect(result?.responseTimeTier).toBe('normal');
  });

  it('returns slow tier for responseTimeMs >= 5000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 5000 });
    expect(result?.responseTimeTier).toBe('slow');
  });

  it('returns slow tier for very large responseTimeMs', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 30000 });
    expect(result?.responseTimeTier).toBe('slow');
  });

  it('includes all timing fields when provided', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 1500,
      gatewayOverheadMs: 50,
      providerTtfbMs: 300,
      streamDurationMs: 1150,
    });
    expect(result).toEqual({
      responseTimeTier: 'normal',
      gatewayOverheadMs: 50,
      providerTtfbMs: 300,
      streamDurationMs: 1150,
    });
  });

  it('handles null/undefined optional fields', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 800,
      gatewayOverheadMs: undefined,
      providerTtfbMs: null as unknown as undefined,
      streamDurationMs: undefined,
    });
    expect(result).toEqual({
      responseTimeTier: 'fast',
      gatewayOverheadMs: undefined,
      providerTtfbMs: null,
      streamDurationMs: undefined,
    });
  });
});

describe('extractErrorInfo', () => {
  it('returns null when no errorMessage and no errorType', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 200 });
    expect(result).toBeNull();
  });

  it('returns null when both error fields are undefined', () => {
    expect(extractErrorInfo({ responseTimeMs: 100 })).toBeNull();
  });

  it('categorizes status 429 as rate_limit and recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 429, errorMessage: 'Rate limited' });
    expect(result).toEqual({ category: 'rate_limit', recoverable: true });
  });

  it('categorizes status 401 as authentication and not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 401, errorMessage: 'Unauthorized' });
    expect(result).toEqual({ category: 'authentication', recoverable: false });
  });

  it('categorizes status 403 as authentication and not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 403, errorMessage: 'Forbidden' });
    expect(result).toEqual({ category: 'authentication', recoverable: false });
  });

  it('categorizes status 400 as invalid_request and not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 400, errorMessage: 'Bad request' });
    expect(result).toEqual({ category: 'invalid_request', recoverable: false });
  });

  it('categorizes status 500 as server_error and not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 500, errorMessage: 'Internal error' });
    expect(result).toEqual({ category: 'server_error', recoverable: false });
  });

  it('categorizes status 503 as server_error but recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 503, errorMessage: 'Service unavailable' });
    expect(result).toEqual({ category: 'server_error', recoverable: true });
  });

  it('categorizes errorType containing "timeout" as timeout and recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, errorType: 'timeout', errorMessage: 'Request timed out' });
    expect(result).toEqual({ category: 'timeout', recoverable: true });
  });

  it('categorizes errorType containing "network" as network and recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, errorType: 'network_error', errorMessage: 'Connection lost' });
    expect(result).toEqual({ category: 'network', recoverable: true });
  });

  it('categorizes errorType containing "rate" as rate_limit but not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, errorType: 'rate_limit_exceeded' });
    expect(result).toEqual({ category: 'rate_limit', recoverable: false });
  });

  it('categorizes unknown errorType as unknown and not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, errorType: 'internal_error', errorMessage: 'Something broke' });
    expect(result).toEqual({ category: 'unknown', recoverable: false });
  });
});

describe('extractBusinessTags', () => {
  it('returns null when all fields are null/undefined', () => {
    const result = extractBusinessTags({ responseTimeMs: 100 });
    expect(result).toBeNull();
  });

  it('returns null when userId and organizationId are undefined and tags is empty', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, userId: undefined, organizationId: undefined, tags: [] });
    expect(result).toBeNull();
  });

  it('returns data with only userId', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, userId: 'user-abc' });
    expect(result).toEqual({
      userId: 'user-abc',
      organizationId: undefined,
      tags: undefined,
    });
  });

  it('returns data with only organizationId', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, organizationId: 'org-123' });
    expect(result).toEqual({
      userId: undefined,
      organizationId: 'org-123',
      tags: undefined,
    });
  });

  it('returns data with only tags', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, tags: ['production', 'critical'] });
    expect(result).toEqual({
      userId: undefined,
      organizationId: undefined,
      tags: ['production', 'critical'],
    });
  });

  it('returns data with all fields present', () => {
    const result = extractBusinessTags({
      responseTimeMs: 100,
      userId: 'user-abc',
      organizationId: 'org-123',
      tags: ['beta'],
    });
    expect(result).toEqual({
      userId: 'user-abc',
      organizationId: 'org-123',
      tags: ['beta'],
    });
  });
});