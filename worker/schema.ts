import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { languages } from '../shared/waitlist';

export const waitlist = sqliteTable('waitlist', {
  email: text('email').primaryKey(),
  language: text('language', { enum: languages }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [check('waitlist_language', sql`${table.language} in ('en-GB', 'es-ES', 'fr-FR')`)]);

export const user = sqliteTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const session = sqliteTable('session', {
  id: text('id').primaryKey(), expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(), token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});
export const account = sqliteTable('account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }), refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }), scope: text('scope'), password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const invitations = sqliteTable('invitations', {
  email: text('email').primaryKey(), expiresAt: integer('expires_at'), redeemedBy: text('redeemed_by'), redeemedAt: integer('redeemed_at'), deliveryId: text('delivery_id'),
});
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(), owner: text('owner').notNull().references(() => user.id),
  createdAt: integer('created_at').notNull(), result: text('result'),
  control: text('control', { enum: ['5+3', '10+5'] }).notNull().default('5+3'),
  difficulty: integer('difficulty').notNull().default(1), colour: text('colour', { enum: ['w', 'b'] }).notNull().default('w'),
});

export * from './player-schema';
export * from './online-schema';
export * from './coach-schema';
export * from './cosmetic-schema';
