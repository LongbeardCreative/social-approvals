import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

/** One post within a platform (img becomes an R2 URL once uploaded). */
export type Post = { copy: string; img: string | null; note: string };
export type PlatformState = { on: boolean; cur: number; posts: Post[] };
/** Keyed by platform id: 'x' | 'ig' | 'fb' | 'li'. */
export type Platforms = Record<string, PlatformState>;

export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'revisions';

export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(), // nanoid slug — the public /r/{id}
  campaign: text('campaign').notNull(),
  account: text('account').notNull(),
  handle: text('handle').notNull(),
  asanaTaskGid: text('asana_task_gid').notNull(),
  platforms: jsonb('platforms').$type<Platforms>().notNull(),
  status: text('status').$type<ReviewStatus>().notNull().default('pending'),
  decisionNotes: text('decision_notes'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
