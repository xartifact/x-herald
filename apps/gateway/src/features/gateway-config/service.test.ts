import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createMockDb } from '../../test/mock-db';
import { getConfig, setConfig, getAllConfigs, clearConfigCache } from './service';

describe('gateway-config service', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
  });

  it('getConfig returns value when found in DB', async () => {
    const db = createMockDb();
    db._setResult('select', [{ value: 'test-value' }]);
    const result = await getConfig('test-key', 'default', db);
    expect(result).toBe('test-value');
  });

  it('getConfig returns default value when not found', async () => {
    const db = createMockDb();
    db._setResult('select', []);
    const result = await getConfig('missing-key', 'default', db);
    expect(result).toBe('default');
  });

  it('getConfig returns null as default when not found', async () => {
    const db = createMockDb();
    db._setResult('select', []);
    const result = await getConfig('missing-key', null, db);
    expect(result).toBeNull();
  });

  it('setConfig inserts new config when key does not exist', async () => {
    const db = createMockDb();
    db._setResult('select', []);
    await setConfig('new-key', 'new-value', 'description', db);
    expect(db._insert).toHaveBeenCalled();
  });

  it('setConfig updates existing config', async () => {
    const db = createMockDb();
    db._setResult('select', [{ id: 'existing-id' }]);
    await setConfig('existing-key', 'updated-value', 'updated-desc', db);
    expect(db._update).toHaveBeenCalled();
  });

  it('getAllConfigs returns all configs as a record', async () => {
    const db = createMockDb();
    db._setResult('select', [
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 'value2' },
    ]);
    const result = await getAllConfigs(db);
    expect(result).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('getAllConfigs returns empty object when no configs', async () => {
    const db = createMockDb();
    db._setResult('select', []);
    const result = await getAllConfigs(db);
    expect(result).toEqual({});
  });
});
