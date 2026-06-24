import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

const realDbClient = await import('../../../db/client');
const originalGetDatabase = realDbClient.getDatabase;
const realLogger = await import('../../../lib/logger');

// ─── Mock DB state ────────────────────────────────────────────────────────────

let mockDb: {
  rejectInsert: boolean;
  insert: ReturnType<typeof mock>;
  values: ReturnType<typeof mock>;
  onConflictDoUpdate: ReturnType<typeof mock>;
};

function createMockDb() {
  const db = {
    rejectInsert: false,
    insert: mock(() => ({
      values: db.values,
    })),
    values: mock(() => ({
      onConflictDoUpdate: db.onConflictDoUpdate,
    })),
    onConflictDoUpdate: mock(() => {
      if (db.rejectInsert) {
        return Promise.reject(new Error('DB conflict'));
      }
      return Promise.resolve([]);
    }),
  };
  return db;
}

mockDb = createMockDb();

// ─── Mock modules ───────────────────────────────────────────────────────────────

mock.module('../../../db/client', () => ({
  getDatabase: mock(() => ({
    insert: mockDb.insert,
  })),
}));

mock.module('../../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
    })),
  },
}));

// ─── Import module under test ─────────────────────────────────────────────────

const { recordClientRequestedModel, recordClientRequestedModels } = await import('./client-model-recorder');

// ─── Tests ────────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
  mock.module('../../../lib/logger', () => realLogger);
});

describe('recordClientRequestedModel', () => {
  beforeEach(() => {
    mock.restore();
    mockDb = createMockDb();
  });

  it('returns early for empty string', async () => {
    await recordClientRequestedModel('');
    expect(mockDb.insert).toHaveBeenCalledTimes(0);
  });

  it('returns early for whitespace-only string', async () => {
    await recordClientRequestedModel('   ');
    expect(mockDb.insert).toHaveBeenCalledTimes(0);
  });

  it('trims whitespace and records model name', async () => {
    await recordClientRequestedModel('  gpt-4  ');
    expect(mockDb.values).toHaveBeenCalled();
    const callArg = (mockDb.values as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { modelName: string };
    expect(callArg.modelName).toBe('gpt-4');
  });

  it('uses upsert for existing model', async () => {
    await recordClientRequestedModel('gpt-4');
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalled();
    expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
  });

  it('catches DB error without throwing', async () => {
    mockDb.rejectInsert = true;
    await expect(recordClientRequestedModel('gpt-4')).resolves.toBeUndefined();
  });
});

describe('recordClientRequestedModels', () => {
  beforeEach(() => {
    mock.restore();
    mockDb = createMockDb();
  });

  it('deduplicates model names', async () => {
    await recordClientRequestedModels(['gpt-4', 'gpt-4', 'gpt-3.5']);
    expect(mockDb.values).toHaveBeenCalledTimes(2);
  });

  it('filters out empty names', async () => {
    await recordClientRequestedModels(['', 'gpt-4', '   ']);
    expect(mockDb.values).toHaveBeenCalledTimes(1);
  });

  it('handles empty array', async () => {
    await recordClientRequestedModels([]);
    expect(mockDb.insert).toHaveBeenCalledTimes(0);
  });

  it('processes all unique names serially', async () => {
    await recordClientRequestedModels(['model-a', 'model-b', 'model-c']);
    expect(mockDb.values).toHaveBeenCalledTimes(3);
  });
});
