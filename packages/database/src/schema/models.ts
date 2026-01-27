import { pgTable, varchar, boolean, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';
import { providers } from './providers';

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  actualModelName: varchar('actual_model_name', { length: 255 }).notNull(),
  routingConfig: jsonb('routing_config').$type<{
    strategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'smart';
    fallbackEnabled: boolean;
    params?: Record<string, any>;
  }>(),
  protocolConversion: jsonb('protocol_conversion').$type<{
    enabled: boolean;
    targetProtocol: 'openai' | 'anthropic' | 'gemini';
    preserveOriginal?: boolean;
  }>(),
  capabilities: jsonb('capabilities').$type<Record<string, any>>(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
