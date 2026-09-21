import {
  pgTable,
  varchar,
  boolean,
  integer,
  timestamp,
  uuid,
  text,
  bigint,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const virtualKeys = pgTable('virtual_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  allowedModels: text('allowed_models').array(),
  rateLimitRpm: integer('rate_limit_rpm'),
  rateLimitRpd: integer('rate_limit_rpd'),
  tokenLimitDaily: bigint('token_limit_daily', { mode: 'bigint' }),
  enabled: boolean('enabled').default(true).notNull(),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  /**
   * 已停用：无任何代码读写，计划下个版本迭代物理删除。
   *
   * 代码侧迁移**已完成**（原读取点 `getKeyStats('all')` 改为从 `request_logs`
   * 聚合，写入点已整体移除）。此列仅作为**存量数据**保留，理由：其值含超出
   * 日志 30 天留存窗口的历史累计，一旦删除不可再生。
   *
   * 这是经确认的迁移窗口，不是未完成的重构。删除登记项：
   * 本列 + `totalTokens` + `key_usage_daily` 表 + 迁移 0027，一并清理。
   */
  totalRequests: integer('total_requests').default(0),
  /** 已停用，同 {@link virtualKeys.totalRequests}；计划下版连同删除。 */
  totalTokens: bigint('total_tokens', { mode: 'bigint' }).default(0n),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type VirtualKey = typeof virtualKeys.$inferSelect
export type NewVirtualKey = typeof virtualKeys.$inferInsert

/**
 * 已停用：建表以来**从未被任何代码读取**（仅由已移除的 `trackKeyUsage` upsert）。
 *
 * 另有类型漂移：此处声明 `timestamp`，而迁移 0027 建的是 `DATE`。
 * 写入点已移除，表与存量数据保留到下个版本迭代，届时连同迁移 0027 一并删除。
 */
export const keyUsageDaily = pgTable(
  'key_usage_daily',
  {
    keyId: uuid('key_id')
      .notNull()
      .references(() => virtualKeys.id, { onDelete: 'cascade' }),
    date: timestamp('date', { mode: 'date' }).notNull(),
    requestCount: integer('request_count').default(0),
    inputTokens: bigint('input_tokens', { mode: 'bigint' }).default(0n),
    outputTokens: bigint('output_tokens', { mode: 'bigint' }).default(0n),
    totalTokens: bigint('total_tokens', { mode: 'bigint' }).default(0n),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.keyId, table.date] }),
  }),
)

export type KeyUsageDaily = typeof keyUsageDaily.$inferSelect
export type NewKeyUsageDaily = typeof keyUsageDaily.$inferInsert
