import { pgTable, varchar, boolean, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const expertRoutingConfig = pgTable('expert_routing_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  enabled: boolean('enabled').default(false).notNull(),
  routingMode: varchar('routing_mode', { length: 20 }).default('hybrid').notNull().$type<'llm' | 'semantic' | 'hybrid'>(),
  config: jsonb('config').$type<{
    classifierModel?: string;
    categories?: string[];
    routing?: {
      semantic?: {
        enabled: boolean;
        model: 'bge-small-zh-v1.5' | 'all-MiniLM-L6-v2';
        threshold: number;
        margin: number;
        routes: Array<{
          category: string;
          utterances: string[];
        }>;
      };
    };
    experts?: Array<{
      category: string;
      providerId: string;
      modelId: string;
      toolPolicy?: {
        mode: 'read_only' | 'standard' | 'restricted';
        allowedTools?: string[];
      };
    }>;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ExpertRoutingConfig = typeof expertRoutingConfig.$inferSelect;
export type NewExpertRoutingConfig = typeof expertRoutingConfig.$inferInsert;
