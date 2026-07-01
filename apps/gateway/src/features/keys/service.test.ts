import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test'
import { createMockDb } from '../../test/mock-db'
import * as realVirtualKey from '../../middleware/virtual-key'
import * as realLogger from '../../lib/logger'

mock.module('../../middleware/virtual-key', () => ({
  ...realVirtualKey,
  invalidateVirtualKeyCache: mock(),
}))

mock.module('../../lib/logger', () => ({
  ...realLogger,
  default: {
    child: () => ({ info: mock(), warn: mock(), error: mock() }),
    warn: mock(),
    info: mock(),
    error: mock(),
    trace: mock(),
    debug: mock(),
  },
}))

afterAll(() => {
  mock.module('../../middleware/virtual-key', () => realVirtualKey)
  mock.module('../../lib/logger', () => realLogger)
})

import {
  listKeys,
  getKey,
  createKey,
  updateKey,
  deleteKey,
  resetKey,
} from './service'

describe('keys service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  afterEach(() => {
    mock.restore()
  })

  it('listKeys returns all keys ordered by createdAt desc', async () => {
    const keys = [
      { id: 'key-1', key: 'xg_abc123', name: 'Key 1', createdAt: new Date('2024-01-01') },
      { id: 'key-2', key: 'xg_def456', name: 'Key 2', createdAt: new Date('2024-01-02') },
    ]
    db._setResult('select', keys)
    const result = await listKeys(db)
    expect(result).toEqual(keys as any)
  })

  it('getKey returns existing key by id', async () => {
    const key = { id: 'key-1', key: 'xg_abc123', name: 'Test Key' }
    db._setResult('select', [key])
    const result = await getKey('key-1', db)
    expect(result).toEqual(key as any)
  })

  it('getKey returns null for non-existent id', async () => {
    db._setResult('select', [])
    const result = await getKey('non-existent', db)
    expect(result).toBeNull()
  })

  it('createKey inserts new key and returns it', async () => {
    const newKey = { id: 'key-1', key: 'xg_test123', name: 'New Key' }
    db._setResult('insert', [newKey])
    const result = await createKey({ name: 'New Key' }, db)
    expect(result).toEqual(newKey as any)
    expect(result.key.startsWith('xg_')).toBe(true)
  })

  it('createKey generates unique key strings', async () => {
    const newKey1 = { id: 'key-1', key: 'xg_test123', name: 'Key 1' }
    const newKey2 = { id: 'key-2', key: 'xg_test456', name: 'Key 2' }
    db._setResult('insert', [newKey1])
    const result1 = await createKey({ name: 'Key 1' }, db)
    db._setResult('insert', [newKey2])
    const result2 = await createKey({ name: 'Key 2' }, db)
    expect(result1.key).not.toBe(result2.key)
  })

  it('createKey handles all optional fields', async () => {
    const newKey = { id: 'key-1', key: 'xg_test', name: 'Full Key' }
    db._setResult('insert', [newKey])
    const result = await createKey({
      name: 'Full Key',
      allowedModels: ['gpt-4'],
      rateLimitRpm: 10,
      rateLimitRpd: 100,
      tokenLimitDaily: 1000,
      enabled: false,
      expiresAt: '2024-12-31T00:00:00Z',
    }, db)
    expect(result).toEqual(newKey as any)
  })

  it('updateKey updates existing key and returns updated key', async () => {
    const existingKey = { id: 'key-1', key: 'xg_old', name: 'Old Name' }
    const updatedKey = { id: 'key-1', key: 'xg_old', name: 'New Name' }
    db._setResult('select', [existingKey])
    db._setResult('update', [updatedKey])
    const result = await updateKey('key-1', { name: 'New Name' }, db)
    expect(result).toEqual(updatedKey as any)
  })

  it('updateKey returns null for non-existent key', async () => {
    db._setResult('select', [])
    const result = await updateKey('non-existent', { name: 'New Name' }, db)
    expect(result).toBeNull()
  })

  it('deleteKey removes existing key and returns true', async () => {
    const existingKey = { id: 'key-1', key: 'xg_old', name: 'Test Key' }
    db._setResult('select', [existingKey])
    const result = await deleteKey('key-1', db)
    expect(result).toBe(true)
  })

  it('deleteKey returns false for non-existent key', async () => {
    db._setResult('select', [])
    const result = await deleteKey('non-existent', db)
    expect(result).toBe(false)
  })

  it('resetKey generates new key for existing key', async () => {
    const existingKey = { id: 'key-1', key: 'xg_old', name: 'Test Key' }
    const newResetKey = { id: 'key-1', key: 'xg_new', name: 'Test Key' }
    db._setResult('select', [existingKey])
    db._setResult('update', [newResetKey])
    const result = await resetKey('key-1', db)
    expect(result).toEqual(newResetKey as any)
    expect(result!.key).not.toBe(existingKey.key)
  })

  it('resetKey returns null for non-existent key', async () => {
    db._setResult('select', [])
    const result = await resetKey('non-existent', db)
    expect(result).toBeNull()
  })

  it('propagates DB errors', async () => {
    db._setResult('select', Promise.reject(new Error('DB error')))
    await expect(getKey('key-1', db)).rejects.toThrow('DB error')
  })
})
