import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  foreignKey,
  index,
} from 'drizzle-orm/pg-core'
import { accessModels } from './model-groups'
import { workspaces } from './workspaces'

import type { CanvasGraph } from '@xartifact/x-herald-shared'

export const routeRules = pgTable(
  'route_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accessModelId: uuid('access_model_id')
      .notNull()
      .references(() => accessModels.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000001'::uuid`)
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    graph: jsonb('graph').$type<CanvasGraph>().notNull().default({ nodes: [], edges: [] }),
    name: varchar('name', { length: 255 }).notNull().default('默认路由规则'),
    description: text('description'),
    active: boolean('active').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceAccessModelFk: foreignKey({
      columns: [table.workspaceId, table.accessModelId],
      foreignColumns: [accessModels.workspaceId, accessModels.id],
      name: 'route_rules_workspace_access_model_fk',
    }).onDelete('cascade'),
    workspaceIdIdx: index('idx_route_rules_workspace_id').on(table.workspaceId),
  }),
)

export type RouteRule = typeof routeRules.$inferSelect
export type NewRouteRule = typeof routeRules.$inferInsert
