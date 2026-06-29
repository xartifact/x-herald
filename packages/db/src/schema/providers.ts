import { pgTable, varchar, boolean, timestamp, text, uuid, jsonb } from 'drizzle-orm/pg-core';

import type { ProtocolsConfig } from '@xartifact/x-llm-gateway-shared';

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  apiKey: text('api_key'),
  protocols: jsonb('protocols').$type<ProtocolsConfig>().notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
