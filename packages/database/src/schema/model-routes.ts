import { pgTable, boolean, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { models } from './models';

export const modelRoutes = pgTable('model_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  virtualModelId: uuid('virtual_model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  physicalModelId: uuid('physical_model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  weight: integer('weight').default(100).notNull(),
  priority: integer('priority').default(0).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type ModelRoute = typeof modelRoutes.$inferSelect;
export type NewModelRoute = typeof modelRoutes.$inferInsert;
