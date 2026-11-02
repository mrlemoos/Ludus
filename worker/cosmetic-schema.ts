import { user } from './schema';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const playerCosmetics = sqliteTable('player_cosmetics', {
  owner: text('owner')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  board: text('board', { enum: ['wood', 'walnut', 'marble'] })
    .notNull()
    .default('wood'),
  pieces: text('pieces', { enum: ['wood', 'ebony'] })
    .notNull()
    .default('wood'),
});
