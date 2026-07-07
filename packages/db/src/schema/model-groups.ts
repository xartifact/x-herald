import { relations } from 'drizzle-orm'
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  jsonb,
  uuid,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { providers } from './providers'

import type {
  ModelCapabilities,
  RoutingConfig,
  InstanceConfig,
  RouteCondition,
  RouteAction,
  FlowData,
} from '@xartifact/x-llm-gateway-shared'

export const modelGroups = pgTable('model_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  aliases: jsonb('aliases').$type<string[]>().default([]),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).default('chat').notNull(),
  capabilities: jsonb('capabilities').$type<ModelCapabilities>().notNull(),
  supportedProtocols: jsonb('supported_protocols').$type<string[]>().default(['openai']),
  enabled: boolean('enabled').default(true).notNull(),
  routingConfig: jsonb('routing_config').$type<RoutingConfig>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type ModelGroup = typeof modelGroups.$inferSelect
export type NewModelGroup = typeof modelGroups.$inferInsert

export const modelInstances = pgTable('model_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  actualModelName: varchar('actual_model_name', { length: 255 }).notNull(),
  description: text('description'),
  config: jsonb('config').$type<InstanceConfig>(),
  weight: integer('weight').default(100).notNull(),
  priority: integer('priority').default(0).notNull(),
  costPer1kTokens: jsonb('cost_per_1k_tokens').$type<{ input: number; output: number }>(),
  healthCheckUrl: varchar('health_check_url', { length: 512 }),
  enabled: boolean('enabled').default(true).notNull(),
  status: varchar('status', { length: 20 }).default('unknown'),
  lastCheckedAt: timestamp('last_checked_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type ModelInstance = typeof modelInstances.$inferSelect
export type NewModelInstance = typeof modelInstances.$inferInsert

export const modelGroupMemberships = pgTable(
  'model_group_memberships',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => modelGroups.id, { onDelete: 'cascade' }),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => modelInstances.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.instanceId] }),
  }),
)

export type ModelGroupMembership = typeof modelGroupMemberships.$inferSelect
export type NewModelGroupMembership = typeof modelGroupMemberships.$inferInsert

export const modelInstancesRelations = relations(modelInstances, ({ one, many }) => ({
  memberships: many(modelGroupMemberships),
  provider: one(providers, {
    fields: [modelInstances.providerId],
    references: [providers.id],
  }),
}))

export const modelGroupMembershipsRelations = relations(modelGroupMemberships, ({ one }) => ({
  group: one(modelGroups, {
    fields: [modelGroupMemberships.groupId],
    references: [modelGroups.id],
  }),
  instance: one(modelInstances, {
    fields: [modelGroupMemberships.instanceId],
    references: [modelInstances.id],
  }),
}))

export const accessModels = pgTable('access_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  enabled: boolean('enabled').default(true).notNull(),
  capabilities: jsonb('capabilities').$type<ModelCapabilities>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type AccessModel = typeof accessModels.$inferSelect
export type NewAccessModel = typeof accessModels.$inferInsert

export const modelRoutes = pgTable('model_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  accessModelIds: text('access_model_ids').array().notNull().default([]),
  conditions: jsonb('conditions').$type<RouteCondition[]>().default([]),
  action: jsonb('action').$type<RouteAction>().notNull(),
  priority: integer('priority').default(0).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  flowData: jsonb('flow_data').$type<FlowData>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const modelRoutesRelations = relations(modelRoutes, ({ many: _many }) => ({
  // Note: accessModelIds is a TEXT[] array - no FK relationship
  // Access model lookup is done at application layer
}))

export type ModelRoute = typeof modelRoutes.$inferSelect
export type NewModelRoute = typeof modelRoutes.$inferInsert
