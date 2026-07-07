import {
  index,
  pgTable,
  real,
  integer,
  timestamp,
  uuid,
  varchar,
  unique,
  boolean,
  jsonb,
  text,
} from 'drizzle-orm/pg-core'

export const instancePerfSnapshots = pgTable(
  'instance_perf_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: varchar('instance_id', { length: 255 }).notNull(),
    instanceName: varchar('instance_name', { length: 255 }),
    groupId: varchar('group_id', { length: 255 }),
    groupName: varchar('group_name', { length: 255 }),
    providerId: varchar('provider_id', { length: 255 }),
    providerName: varchar('provider_name', { length: 255 }),
    bucketStart: timestamp('bucket_start').notNull(),
    bucketEnd: timestamp('bucket_end').notNull(),

    sampleCount: integer('sample_count').default(0).notNull(),
    successCount: integer('success_count').default(0).notNull(),
    errorCount: integer('error_count').default(0).notNull(),
    successRate: real('success_rate'),

    // TTFB (ms) - providerTtfbMs
    ttfbAvg: real('ttfb_avg'),
    ttfbP50: real('ttfb_p50'),
    ttfbP95: real('ttfb_p95'),
    ttfbP99: real('ttfb_p99'),
    ttfbMin: real('ttfb_min'),
    ttfbMax: real('ttfb_max'),

    // 总响应时间 (ms) - response_time_ms
    latencyAvg: real('latency_avg'),
    latencyP50: real('latency_p50'),
    latencyP95: real('latency_p95'),
    latencyP99: real('latency_p99'),

    // TTFT (ms) - ttfbToFirstTextMs（流式请求）
    ttftAvg: real('ttft_avg'),
    ttftP95: real('ttft_p95'),

    // 生成速度 (tokens/sec)
    tpsAvg: real('tps_avg'),
    tpsP50: real('tps_p50'),

    avgInputTokens: real('avg_input_tokens'),
    avgOutputTokens: real('avg_output_tokens'),
    avgRetryCount: real('avg_retry_count'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_instance_bucket').on(table.instanceId, table.bucketStart),
    index('idx_ips_instance_bucket').on(table.instanceId, table.bucketStart),
    index('idx_ips_provider_bucket').on(table.providerId, table.bucketStart),
    index('idx_ips_bucket_start').on(table.bucketStart),
  ],
)

export type InstancePerfSnapshot = typeof instancePerfSnapshots.$inferSelect
export type NewInstancePerfSnapshot = typeof instancePerfSnapshots.$inferInsert

export const anomalyEvents = pgTable(
  'anomaly_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 50 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
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
  ],
)

export type AnomalyEvent = typeof anomalyEvents.$inferSelect
export type NewAnomalyEvent = typeof anomalyEvents.$inferInsert
