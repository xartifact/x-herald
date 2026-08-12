import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core'
import { accessModels } from './model-groups'

import type { CanvasGraph } from '@xartifact/x-herald-shared'

export const routeRules = pgTable('route_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  accessModelId: uuid('access_model_id')
    .notNull()
    .references(() => accessModels.id, { onDelete: 'cascade' }),
  graph: jsonb('graph').$type<CanvasGraph>().notNull().default({ nodes: [], edges: [] }),
  name: varchar('name', { length: 255 }).notNull().default('默认路由规则'),
  description: text('description'),
  active: boolean('active').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type RouteRule = typeof routeRules.$inferSelect
export type NewRouteRule = typeof routeRules.$inferInsert
