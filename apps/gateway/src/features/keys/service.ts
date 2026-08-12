import crypto from 'crypto'

import { and, desc, eq, ilike, isNull, sql } from '@xartifact/x-herald-db'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { invalidateVirtualKeyCache } from '../../middleware/virtual-key'

import { virtualKeys, type NewVirtualKey } from '@xartifact/x-herald-db'

const logger = rootLogger.child({ module: 'keys-service' })

function generateApiKey(): string {
  return `xg_${crypto.randomBytes(32).toString('hex')}`
}

export interface ListKeysOptions {
  search?: string
  limit?: number
  offset?: number
}

export async function listKeys(options: ListKeysOptions = {}, db?: Database) {
  const database = db ?? getDatabase()
  const conditions = [isNull(virtualKeys.deletedAt)]
  if (options.search) {
    conditions.push(ilike(virtualKeys.name, `%${options.search}%`))
  }
  const where = and(...conditions)
  return database
    .select()
    .from(virtualKeys)
    .where(where)
    .orderBy(desc(virtualKeys.createdAt))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0)
}

export async function countKeys(search?: string, db?: Database) {
  const database = db ?? getDatabase()
  const conditions = [isNull(virtualKeys.deletedAt)]
  if (search) {
    conditions.push(ilike(virtualKeys.name, `%${search}%`))
  }
  const where = and(...conditions)
  const rows = await database
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(virtualKeys)
    .where(where)
  return rows[0]?.total ?? 0
}

export async function getKey(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const rows = await database.select().from(virtualKeys).where(eq(virtualKeys.id, id)).limit(1)
  return rows[0] ?? null
}

interface CreateKeyData {
  name: string
  allowedModels?: string[] | null
  rateLimitRpm?: number | null
  rateLimitRpd?: number | null
  tokenLimitDaily?: number | string | null
  enabled?: boolean
  expiresAt?: string | null
}

export async function createKey(data: CreateKeyData, db?: Database) {
  const database = db ?? getDatabase()
  const newKey: NewVirtualKey = {
    key: generateApiKey(),
    name: data.name,
    allowedModels: data.allowedModels ?? null,
    rateLimitRpm: data.rateLimitRpm ?? null,
    rateLimitRpd: data.rateLimitRpd ?? null,
    tokenLimitDaily: data.tokenLimitDaily ? BigInt(data.tokenLimitDaily) : null,
    enabled: data.enabled !== undefined ? data.enabled : true,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
  }
  const rows = await database.insert(virtualKeys).values(newKey).returning()
  logger.info({ keyId: rows[0].id }, 'Virtual key created')
  return rows[0]
}

interface UpdateKeyData {
  name?: string
  allowedModels?: string[] | null
  rateLimitRpm?: number | null
  rateLimitRpd?: number | null
  tokenLimitDaily?: number | string | null
  enabled?: boolean
  expiresAt?: string | null
}

export async function updateKey(id: string, data: UpdateKeyData, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await getKey(id, db)
  if (!existing) return null

  const update: Partial<NewVirtualKey> & { updatedAt: Date } = { updatedAt: new Date() }
  if (data.name !== undefined) update.name = data.name
  if (data.allowedModels !== undefined) update.allowedModels = data.allowedModels
  if (data.rateLimitRpm !== undefined) update.rateLimitRpm = data.rateLimitRpm
  if (data.rateLimitRpd !== undefined) update.rateLimitRpd = data.rateLimitRpd
  if (data.tokenLimitDaily !== undefined)
    update.tokenLimitDaily = data.tokenLimitDaily ? BigInt(data.tokenLimitDaily) : null
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.expiresAt !== undefined)
    update.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null

  const rows = await database
    .update(virtualKeys)
    .set(update)
    .where(eq(virtualKeys.id, id))
    .returning()
  invalidateVirtualKeyCache(existing.key)
  logger.info({ keyId: id }, 'Virtual key updated')
  return rows[0] ?? null
}

export async function deleteKey(id: string, db?: Database): Promise<boolean> {
  const database = db ?? getDatabase()
  const existing = await getKey(id, db)
  if (!existing || existing.deletedAt) return false
  // 逻辑删除：标记 deletedAt 而非物理删除。
  // 保留行以维持 request_logs 的外键引用完整性。
  invalidateVirtualKeyCache(existing.key)
  await database
    .update(virtualKeys)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(virtualKeys.id, id))
  logger.info({ keyId: id }, 'Virtual key soft-deleted')
  return true
}

export async function resetKey(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await getKey(id, db)
  if (!existing) return null
  const newApiKey = generateApiKey()
  const rows = await database
    .update(virtualKeys)
    .set({ key: newApiKey, updatedAt: new Date() })
    .where(eq(virtualKeys.id, id))
    .returning()
  invalidateVirtualKeyCache(existing.key)
  logger.info({ keyId: id }, 'Virtual key reset')
  return rows[0] ?? null
}
