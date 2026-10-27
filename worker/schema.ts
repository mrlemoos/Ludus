import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { languages } from '../shared/waitlist';

export const waitlist = sqliteTable('waitlist', {
  email: text('email').primaryKey(),
  language: text('language', { enum: languages }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [check('waitlist_language', sql`${table.language} in ('en-GB', 'es-ES', 'fr-FR')`)]);
