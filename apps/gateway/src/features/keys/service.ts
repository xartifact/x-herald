import crypto from 'crypto'

import { desc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { invalidateVirtualKeyCache } from '../../middleware/virtual-key'

import { virtualKeys, type NewVirtualKey } from '@x-llm-gateway/db'

const logger = rootLogger.child({ module: 'keys-service' })

function generateApiKey(): string {
  return `xg_${crypto.randomBytes(32).toString('hex')}`
}

export async function listKeys(db?: Database) {
  const database = db ?? getDatabase()
  return database.select().from(virtualKeys).orderBy(desc(virtualKeys.createdAt))
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
  if (data.tokenLimitDaily !== undefined) update.tokenLimitDaily = data.tokenLimitDaily ? BigInt(data.tokenLimitDaily) : null
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.expiresAt !== undefined) update.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null

  const rows = await database.update(virtualKeys).set(update).where(eq(virtualKeys.id, id)).returning()
  invalidateVirtualKeyCache(existing.key)
  logger.info({ keyId: id }, 'Virtual key updated')
  return rows[0] ?? null
}

export async function deleteKey(id: string, db?: Database): Promise<boolean> {
  const database = db ?? getDatabase()
  const existing = await getKey(id, db)
  if (!existing) return false
  invalidateVirtualKeyCache(existing.key)
  await database.delete(virtualKeys).where(eq(virtualKeys.id, id))
  logger.info({ keyId: id }, 'Virtual key deleted')
  return true
}

export async function resetKey(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await getKey(id, db)
  if (!existing) return null
  const newApiKey = generateApiKey()
  const rows = await database.update(virtualKeys).set({ key: newApiKey, updatedAt: new Date() }).where(eq(virtualKeys.id, id)).returning()
  invalidateVirtualKeyCache(existing.key)
  logger.info({ keyId: id }, 'Virtual key reset')
  return rows[0] ?? null
}
