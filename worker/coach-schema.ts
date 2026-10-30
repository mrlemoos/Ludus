import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const coachRequests = sqliteTable('coach_requests', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), requestKey: text('request_key').notNull(), fingerprint: text('fingerprint').notNull(),
  kind: text('kind').notNull(), reviewId: text('review_id'), month: text('month').notNull(), state: text('state').notNull(),
  reservedMicros: integer('reserved_micros').notNull(), spentMicros: integer('spent_micros').notNull().default(0),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const coachReviews = sqliteTable('coach_reviews', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), matchId: text('match_id').notNull(), language: text('language').notNull(),
  profile: text('profile').notNull(), document: text('document').notNull(), analysis: text('analysis').notNull(), createdAt: integer('created_at').notNull(),
});
export const coachReplies = sqliteTable('coach_replies', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), reviewId: text('review_id').notNull(), language: text('language').notNull(),
  question: text('question').notNull(), document: text('document').notNull(), createdAt: integer('created_at').notNull(),
});
