import {
  pgTable,
  varchar,
  integer,
  smallint,
  timestamp,
  text,
  uuid,
  doublePrecision,
  index,
  jsonb,
} from 'drizzle-orm/pg-core'

export const INTENT_SOURCE_VALUES = [
  'model_name',
  'capability',
  'classifier',
  'fallback',
  'default',
  'agent_directive',
] as const
export type IntentSource = (typeof INTENT_SOURCE_VALUES)[number]

export const intentLogs = pgTable(
  'intent_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestGroupId: uuid('request_group_id'),
    virtualKeyId: uuid('virtual_key_id'),
    virtualKeyName: varchar('virtual_key_name', { length: 255 }),
    accessModelId: uuid('access_model_id'),
    accessModelName: varchar('access_model_name', { length: 255 }),
    modelRouteId: uuid('model_route_id'),
    modelRouteName: varchar('model_route_name', { length: 255 }),
    modelRoutePriority: integer('model_route_priority'),
    intentName: varchar('intent_name', { length: 255 }).notNull(),
    intentSource: varchar('intent_source', { length: 50 }).$type<IntentSource>().notNull(),
    intentConfidence: doublePrecision('intent_confidence'),
    /**
     * 分类器实际返回的 category 字符串（与 classifier_raw_response 解耦，
     * 便于检索/分析）。即使该 category 不在 route config 的 targetGroupIds
     * 里也会写入，让运维能看见 "AI 想说 X 但配置没把 X 路由出去" 的信号。
     */
    classifierCategory: varchar('classifier_category', { length: 255 }),
    targetGroupId: uuid('target_group_id'),
    targetGroupName: varchar('target_group_name', { length: 255 }),
    classifierProviderId: uuid('classifier_provider_id'),
    classifierProviderName: varchar('classifier_provider_name', { length: 255 }),
    classifierModelName: varchar('classifier_model_name', { length: 255 }),
    classifierLatencyMs: integer('classifier_latency_ms'),
    classifierRawResponse: text('classifier_raw_response'),
    classifierPromptVersion: integer('classifier_prompt_version'),
    userMessageRaw: text('user_message_raw'),
    userMessage: text('user_message'),
    userMessageCapabilities: text('user_message_capabilities').array().notNull().default([]),
    classifierSystemPrompt: text('classifier_system_prompt'),
    classifierReasoning: text('classifier_reasoning'),
    classifierRequestMessages: jsonb('classifier_request_messages'),
    classifierRequestBody: jsonb('classifier_request_body'),
    classifierResponseBody: jsonb('classifier_response_body'),
    classifierStatusCode: smallint('classifier_status_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_intent_logs_virtual_key_id').on(table.virtualKeyId),
    index('idx_intent_logs_access_model_id').on(table.accessModelId),
    index('idx_intent_logs_model_route_id').on(table.modelRouteId),
    index('idx_intent_logs_intent_name').on(table.intentName),
    index('idx_intent_logs_intent_source').on(table.intentSource),
    index('idx_intent_logs_created_at').on(table.createdAt),
    index('idx_intent_logs_request_group_id').on(table.requestGroupId),
    index('idx_intent_logs_classifier_category').on(table.classifierCategory),
  ],
)

export type IntentLog = typeof intentLogs.$inferSelect
export type NewIntentLog = typeof intentLogs.$inferInsert
