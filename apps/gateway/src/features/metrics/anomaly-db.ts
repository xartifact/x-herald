import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const anomalyEvents = pgTable(
  'anomaly_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 50 }).notNull(), // 'slow_request' | 'high_error_rate' | 'high_token_usage' | 'provider_down'
    severity: varchar('severity', { length: 20 }).notNull(), // 'warning' | 'critical'
    providerName: varchar('provider_name', { length: 255 }),
    modelName: varchar('model_name', { length: 255 }),
    instanceId: varchar('instance_id', { length: 255 }),
    description: text('description'),
    details: jsonb('details'),
    resolved: boolean('resolved').default(false),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_anomaly_events_type').on(table.type),
    index('idx_anomaly_events_severity').on(table.severity),
    index('idx_anomaly_events_resolved').on(table.resolved),
    index('idx_anomaly_events_created').on(table.createdAt),
  ]
);

export type AnomalyEvent = typeof anomalyEvents.$inferSelect;
export type NewAnomalyEvent = typeof anomalyEvents.$inferInsert;
