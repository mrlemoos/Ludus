import { integer, real, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const onlineMatches = sqliteTable('online_matches', {
  id: text('id').primaryKey(), whiteId: text('white_id').notNull(), blackId: text('black_id').notNull(), control: text('control').notNull(),
  rated: integer('rated', { mode: 'boolean' }).notNull(), result: text('result'), finishedAt: integer('finished_at'),
});
export const onlineResults = sqliteTable('online_results', { matchId: text('match_id').primaryKey(), processed: integer('processed').notNull().default(0) });
export const ratings = sqliteTable('ratings', {
  userId: text('user_id').notNull(), control: text('control').notNull(), rating: real('rating').notNull().default(1500), deviation: real('deviation').notNull().default(350),
  volatility: real('volatility').notNull().default(0.06), games: integer('games').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.userId, table.control] })]);
export const matchReports = sqliteTable('match_reports', {
  id: text('id').primaryKey(), matchId: text('match_id').notNull(), reporterId: text('reporter_id').notNull(), opponentId: text('opponent_id').notNull(), category: text('category').notNull(), status: text('status').notNull().default('open'), reviewedBy: text('reviewed_by'), reviewedAt: integer('reviewed_at'), createdAt: integer('created_at').notNull(),
});
