import { pgTable, integer, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'completed', 'failed']);
export const jobTypeEnum = pgEnum('job_type', ['cash_memo', 'dac']);
export const identifierTypeEnum = pgEnum('identifier_type', ['consumer', 'phone']);

export const jobs = pgTable('jobs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  jobType: jobTypeEnum('job_type').notNull().default('cash_memo'),
  orderNumber: text('order_number').notNull(),
  identifierType: identifierTypeEnum('identifier_type'),
  details: text('details'),
  status: jobStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(2),
  resultMessage: text('result_message'),
  errorMessage: text('error_message'),
  errorScreenshot: text('error_screenshot'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('idx_jobs_status_created').on(t.status, t.createdAt),
  index('idx_jobs_type_created').on(t.jobType, t.createdAt),
  index('idx_jobs_order_number').on(t.orderNumber),
]);

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
