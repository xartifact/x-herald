import { describe, it, expect, mock, beforeEach, afterAll, type Mock } from 'bun:test';

const realDbClient = await import('../../../db/client');
const originalGetDatabase = realDbClient.getDatabase;

let mockExecute: Mock<() => Promise<unknown>> = mock((): Promise<unknown> => Promise.resolve({ rows: [] }));

const mockDb = {
  get execute() {
    return mockExecute;
  },
};

mock.module('../../../db/client', () => ({
  getDatabase: mock(() => mockDb),
}));

import { alignToBucket, aggregateBucket, aggregateRecentBuckets } from './snapshot-aggregator';

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
});

describe('alignToBucket', () => {
  it('aligns to nearest 5-minute bucket', () => {
    const date = new Date('2025-01-15T10:07:30Z');
    const aligned = alignToBucket(date, 5);
    expect(aligned.getTime()).toBe(new Date('2025-01-15T10:05:00Z').getTime());
  });

  it('keeps exact boundary unchanged', () => {
    const date = new Date('2025-01-15T10:05:00Z');
    const aligned = alignToBucket(date, 5);
    expect(aligned.getTime()).toBe(date.getTime());
  });

  it('handles midnight boundary', () => {
    const date = new Date('2025-01-16T00:02:00Z');
    const aligned = alignToBucket(date, 5);
    expect(aligned.getTime()).toBe(new Date('2025-01-16T00:00:00Z').getTime());
  });

  it('works with 1-minute buckets', () => {
    const date = new Date('2025-01-15T10:07:30Z');
    const aligned = alignToBucket(date, 1);
    expect(aligned.getTime()).toBe(new Date('2025-01-15T10:07:00Z').getTime());
  });

  it('works with 15-minute buckets', () => {
    const date = new Date('2025-01-15T10:07:00Z');
    const aligned = alignToBucket(date, 15);
    expect(aligned.getTime()).toBe(new Date('2025-01-15T10:00:00Z').getTime());
  });

  it('works with 60-minute buckets', () => {
    const date = new Date('2025-01-15T10:30:00Z');
    const aligned = alignToBucket(date, 60);
    expect(aligned.getTime()).toBe(new Date('2025-01-15T10:00:00Z').getTime());
  });
});

describe('aggregateBucket', () => {
  beforeEach(() => {
    mockExecute = mock((): Promise<unknown> => Promise.resolve({ rows: [] }));
  });

  it('returns row count from execute result', async () => {
    mockExecute = mock((): Promise<unknown> => Promise.resolve({ rows: [{}, {}] }));
    const count = await aggregateBucket(new Date('2025-01-15T10:00:00Z'), 5);
    expect(count).toBe(2);
  });

  it('returns 0 for empty result', async () => {
    mockExecute = mock(() => Promise.resolve({ rows: [] }));
    const count = await aggregateBucket(new Date('2025-01-15T10:00:00Z'), 5);
    expect(count).toBe(0);
  });

  it('handles array result from pg', async () => {
    mockExecute = mock((): Promise<unknown> => Promise.resolve([{}, {}, {}]));
    const count = await aggregateBucket(new Date('2025-01-15T10:00:00Z'), 5);
    expect(count).toBe(3);
  });
});

describe('aggregateRecentBuckets', () => {
  beforeEach(() => {
    mockExecute = mock((): Promise<unknown> => Promise.resolve({ rows: [] }));
  });

  it('calls aggregateBucket N times for bucketCount', async () => {
    await aggregateRecentBuckets(3, 5);
    expect(mockExecute.mock.calls.length).toBe(3);
  });

  it('continues on error for individual buckets', async () => {
    let callCount = 0;
    mockExecute = mock((): Promise<unknown> => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error('bucket error'));
      }
      return Promise.resolve({ rows: [] });
    });
    await aggregateRecentBuckets(3, 5);
    expect(mockExecute.mock.calls.length).toBe(3);
  });
});
