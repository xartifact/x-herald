import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

const realDbClient = await import('../../db/client');
const originalGetDatabase = realDbClient.getDatabase;
const realLogger = await import('../../lib/logger');

// ─── Mock DB state ────────────────────────────────────────────────────────────

let deleteResult: Promise<unknown[]> = Promise.resolve([]);
let selectResult: Promise<unknown[]> = Promise.resolve([]);

const returningMock = mock(() => deleteResult);
const whereMock = mock(() => ({ returning: returningMock }));
const deleteMock = mock(() => ({ where: whereMock }));
const selectWhereMock = mock(() => Promise.resolve(selectResult));
const selectFromMock = mock(() => ({ where: selectWhereMock }));
const selectMock = mock(() => ({ from: selectFromMock }));
const getDatabaseMock = mock(() => ({
  select: selectMock,
  delete: deleteMock,
}));

// ─── Mock modules ───────────────────────────────────────────────────────────────

mock.module('../../db/client', () => ({
  getDatabase: getDatabaseMock,
}));

mock.module('../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    trace: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      trace: mock(() => {}),
    })),
  },
}));

// ─── Import module under test ─────────────────────────────────────────────────

const { cleanupLogs, startAutoCleanup, stopAutoCleanup } = await import('./log-cleanup');

// ─── Tests ────────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
  mock.module('../../lib/logger', () => realLogger);
});

describe('cleanupLogs', () => {
  beforeEach(() => {
    mock.restore();
    deleteResult = Promise.resolve([]);
    selectResult = Promise.resolve([]);
  });

  it('returns deleted count for normal cleanup', async () => {
    selectResult = Promise.resolve([{ id: 'log-1' }, { id: 'log-2' }]);
    deleteResult = Promise.resolve([{ id: 'log-1' }, { id: 'log-2' }]);
    const count = await cleanupLogs(30);
    expect(count).toBe(2);
    expect(selectMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
  });

  it('returns 0 when no logs to delete', async () => {
    selectResult = Promise.resolve([]);
    deleteResult = Promise.resolve([]);
    const count = await cleanupLogs(30);
    expect(count).toBe(0);
  });

  it('handles retentionDays = 0 edge case', async () => {
    selectResult = Promise.resolve([]);
    deleteResult = Promise.resolve([]);
    const count = await cleanupLogs(0);
    expect(count).toBe(0);
    expect(selectMock).toHaveBeenCalled();
  });

  it('propagates DB errors', async () => {
    selectResult = Promise.reject(new Error('DB timeout'));
    await expect(cleanupLogs(30)).rejects.toThrow('DB timeout');
  });
});

describe('startAutoCleanup / stopAutoCleanup', () => {
  it('starts and returns a timer ID', () => {
    const timer = startAutoCleanup(24, 30);
    expect(timer).toBeDefined();
    stopAutoCleanup(timer);
  });

  it('can be stopped without error', () => {
    const timer = startAutoCleanup(1, 7);
    expect(() => stopAutoCleanup(timer)).not.toThrow();
  });
});
