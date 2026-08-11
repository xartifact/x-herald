import { integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const classifierPrompts = pgTable('classifier_prompts', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  version: integer('version').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
})

export type ClassifierPrompt = typeof classifierPrompts.$inferSelect
export type NewClassifierPrompt = typeof classifierPrompts.$inferInsert
