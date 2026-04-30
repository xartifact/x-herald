import { pgTable, varchar, integer, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const circuitBreakerEvents = pgTable('circuit_breaker_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: varchar('instance_id', { length: 255 }).notNull(),
  instanceName: varchar('instance_name', { length: 255 }).notNull().default(''),
  groupName: varchar('group_name', { length: 255 }).notNull().default(''),
  providerName: varchar('provider_name', { length: 255 }).notNull().default(''),
  event: varchar('event', { length: 20 }).notNull().$type<'opened' | 'half_open' | 'closed'>(),
  failureCount: integer('failure_count').notNull().default(0),
  openUntil: timestamp('open_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_cb_events_instance_id').on(table.instanceId),
  index('idx_cb_events_created_at').on(table.createdAt),
  index('idx_cb_events_event').on(table.event),
]);

export type CircuitBreakerEvent = typeof circuitBreakerEvents.$inferSelect;
export type NewCircuitBreakerEvent = typeof circuitBreakerEvents.$inferInsert;
