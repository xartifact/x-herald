import { index, integer, pgTable, real, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const costRecords = pgTable('cost_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestLogId: varchar('request_log_id', { length: 255 }),
  keyId: varchar('key_id', { length: 255 }),
  keyName: varchar('key_name', { length: 255 }),
  modelName: varchar('model_name', { length: 255 }),
  providerName: varchar('provider_name', { length: 255 }),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  inputCost: real('input_cost').default(0),
  outputCost: real('output_cost').default(0),
  totalCost: real('total_cost').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_cost_records_key').on(table.keyId),
  index('idx_cost_records_provider').on(table.providerName),
  index('idx_cost_records_model').on(table.modelName),
  index('idx_cost_records_created').on(table.createdAt),
]);

export type CostRecord = typeof costRecords.$inferSelect;
export type NewCostRecord = typeof costRecords.$inferInsert;
