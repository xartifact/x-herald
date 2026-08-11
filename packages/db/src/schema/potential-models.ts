import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uuid,
  text,
  boolean,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { accessModels } from './model-groups'

export const POTENTIAL_MODEL_ACTIONS = ['observe', 'route_to_access_model'] as const
export type PotentialModelAction = (typeof POTENTIAL_MODEL_ACTIONS)[number]

/**
 * 潜在模型：客户端请求过、但尚未接入的模型。
 *
 * AccessModelRouter 在 access_model 命中失败时记录该 model_name。
 * 落库策略：每个进程内累积命中数达到阈值（默认 3）才首次落库，
 * 之后通过 UPSERT 维护 request_count + last_seen_at。
 *
 * admin 行为：
 *  - "Convert"：将该 model_name 提升为新的 access_model（创建后删除本行）
 *  - "Route to"：将 action 设为 route_to_access_model 并指向已存在的 access_model
 *  - "Disable"：将 enabled 置为 false（不被自动清理，不参与路由）
 *
 * 自动清理：daily job 删除 last_seen_at < now - 30 days AND action='observe' AND enabled=true 的行。
 */
export const potentialModels = pgTable(
  'potential_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelName: varchar('model_name', { length: 255 }).notNull().unique(),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    requestCount: integer('request_count').default(1).notNull(),
    sampleVirtualKeyIds: text('sample_virtual_key_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    action: varchar('action', { length: 30 })
      .$type<PotentialModelAction>()
      .notNull()
      .default('observe'),
    targetAccessModelId: uuid('target_access_model_id').references(() => accessModels.id, {
      onDelete: 'set null',
    }),
    enabled: boolean('enabled').default(true).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_potential_models_last_seen').on(table.lastSeenAt),
    index('idx_potential_models_action').on(table.action),
    index('idx_potential_models_target_am').on(table.targetAccessModelId),
    index('idx_potential_models_request_count').on(table.requestCount),
  ],
)

export type PotentialModel = typeof potentialModels.$inferSelect
export type NewPotentialModel = typeof potentialModels.$inferInsert
