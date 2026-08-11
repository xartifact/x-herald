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
  totalRequests: integer('total_requests').default(0),
  totalTokens: bigint('total_tokens', { mode: 'bigint' }).default(0n),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type VirtualKey = typeof virtualKeys.$inferSelect
export type NewVirtualKey = typeof virtualKeys.$inferInsert

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
