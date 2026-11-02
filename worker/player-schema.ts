import { user } from './schema';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const playerProfiles = sqliteTable('player_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  username: text('username').notNull().unique(),
  language: text('language').notNull(),
  timezone: text('timezone').notNull(),
  pendingTimezone: text('pending_timezone'),
  timezoneEffectiveAt: integer('timezone_effective_at'),
  chessLevel: text('chess_level').notNull(),
  teachingProfile: text('teaching_profile').notNull(),
  activityPublic: integer('activity_public', { mode: 'boolean' }).notNull().default(true),
  adultAttestedAt: integer('adult_attested_at').notNull(),
  policyVersion: text('policy_version').notNull(),
  onboardedAt: integer('onboarded_at').notNull(),
  trialExpiresAt: integer('trial_expires_at').notNull(),
  mutationId: text('mutation_id').notNull().default('initial'),
});
export const activityEvents = sqliteTable(
  'activity_events',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id').notNull(),
    completedAt: integer('completed_at').notNull(),
    date: text('date').notNull(),
    timezone: text('timezone').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameId] })],
);
export const timezoneHistory = sqliteTable(
  'timezone_history',
  {
    userId: text('user_id').notNull(),
    effectiveAt: integer('effective_at').notNull(),
    timezone: text('timezone').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.effectiveAt] })],
);
export const invitationDeliveries = sqliteTable('invitation_deliveries', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull(),
  email: text('email').notNull(),
  operatorId: text('operator_id').notNull(),
  language: text('language').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  sentAt: integer('sent_at'),
  status: text('status').notNull(),
});
export const accountDeletions = sqliteTable('account_deletions', {
  userId: text('user_id').primaryKey(),
  requestedAt: integer('requested_at').notNull(),
  completedAt: integer('completed_at'),
});
export const complimentaryPlus = sqliteTable('complimentary_plus', {
  email: text('email').primaryKey(),
  grantedAt: integer('granted_at').notNull(),
  revokedAt: integer('revoked_at'),
});
export const invitationBatches = sqliteTable('invitation_batches', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  operatorId: text('operator_id').notNull(),
  reissue: integer('reissue', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});
