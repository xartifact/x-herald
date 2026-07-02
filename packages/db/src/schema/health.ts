import {
  pgTable,
  varchar,
  boolean,
  integer,
  timestamp,
  text,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core'

export const healthTargets = pgTable('health_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().$type<'model' | 'virtual_model'>(),
  targetId: uuid('target_id').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  checkIntervalSeconds: integer('check_interval_seconds').default(300).notNull(),
  checkPrompt: varchar('check_prompt', { length: 512 }).default('Say "OK"').notNull(),
  checkConfig: jsonb('check_config'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const healthRuns = pgTable('health_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetId: uuid('target_id')
    .notNull()
    .references(() => healthTargets.id, { onDelete: 'cascade' }),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).notNull().$type<'healthy' | 'degraded' | 'down'>(),
  responseTimeMs: integer('response_time_ms'),
  errorType: varchar('error_type', { length: 64 }),
  errorMessage: text('error_message'),
})

export type HealthTarget = typeof healthTargets.$inferSelect
export type NewHealthTarget = typeof healthTargets.$inferInsert
export type HealthRun = typeof healthRuns.$inferSelect
export type NewHealthRun = typeof healthRuns.$inferInsert
