import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

const realDbClient = await import('../../../db/client');
const originalGetDatabase = realDbClient.getDatabase;

// ─── Mock DB with mutable state ───────────────────────────────────────────────

interface MockDbState {
  // Mutable result promises — tests can override these
  updateReturningResult: Promise<unknown>;
  selectWhereResult: Promise<unknown>;
  // Mock function references
  update: ReturnType<typeof mock>;
  select: ReturnType<typeof mock>;
}

function createMockDb(): MockDbState {
  const state: MockDbState = {
    updateReturningResult: Promise.resolve([]),
    selectWhereResult: Promise.resolve([]),
    update: null!,
    select: null!,
  };

  const returning = mock(() => state.updateReturningResult);
  const whereUpdate = mock(() => ({ returning }));
  const set = mock(() => ({ where: whereUpdate }));
  state.update = mock(() => ({ set }));

  const whereSelect = mock(() => state.selectWhereResult);
  const from = mock(() => ({ where: whereSelect }));
  state.select = mock(() => ({ from }));

  return state;
}

let mockDb = createMockDb();

mock.module('../../../db/client', () => ({
  getDatabase: mock(() => ({
    update: mockDb.update,
    select: mockDb.select,
  })),
}));

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
});

// ─── Import module under test ─────────────────────────────────────────────────

const { cleanupStaleStreams, getIncompleteStreams } = await import('../stream-cleanup');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('cleanupStaleStreams', () => {
  beforeEach(() => {
    mock.restore();
    mockDb = createMockDb();
  });

  it('should return 0 when no stale streams exist', async () => {
    const count = await cleanupStaleStreams(5);

    expect(count).toBe(0);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it('should return the count of cleaned stale streams', async () => {
    mockDb.updateReturningResult = Promise.resolve([
      { id: 'log-1' },
      { id: 'log-2' },
      { id: 'log-3' },
    ]);

    const count = await cleanupStaleStreams(5);

    expect(count).toBe(3);
  });

  it('should return 0 when DB throws an error', async () => {
    // Make the .where() step throw by rejecting
    const { getDatabase } = await import('../../../db/client');
    const db = getDatabase();
    const setResult = db.update({});
    // Intercept the set().where() chain via the mock state
    mockDb.updateReturningResult = Promise.reject(new Error('DB failure'));
    // Force the updateSet.where to throw
    // Actually, the throw comes from the Promise.reject in the chain
    // Let's use a different approach: make the whole transaction fail

    const count = await cleanupStaleStreams(5);
    expect(count).toBe(0);
  });

  it('should handle DB error gracefully', async () => {
    mockDb.updateReturningResult = Promise.reject(new Error('Query failed'));

    const count = await cleanupStaleStreams(5);
    expect(count).toBe(0);
  });
});

describe('getIncompleteStreams', () => {
  beforeEach(() => {
    mock.restore();
    mockDb = createMockDb();
  });

  it('should return empty array when no incomplete streams', async () => {
    const streams = await getIncompleteStreams();

    expect(streams).toEqual([]);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('should return stream rows when incomplete streams exist', async () => {
    const mockStreams = [
      {
        id: 'log-1',
        modelName: 'gpt-4',
        streamStatus: 'streaming',
        chunksProcessed: { chunksProcessed: 5, bytesReceived: 100, lastChunkAt: Date.now() },
      },
    ];
    mockDb.selectWhereResult = Promise.resolve(mockStreams);

    const streams = await getIncompleteStreams();

    expect(streams).toEqual(mockStreams);
    expect(streams).toHaveLength(1);
    expect(streams[0].id).toBe('log-1');
  });

  it('should return empty array on DB error', async () => {
    mockDb.selectWhereResult = Promise.reject(new Error('DB failure'));

    const streams = await getIncompleteStreams();

    expect(streams).toEqual([]);
  });
});