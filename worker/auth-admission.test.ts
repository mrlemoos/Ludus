import { admitSession } from './auth';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of [
    '0000_grey_triton.sql',
    '0001_pale_microchip.sql',
    '0003_accounts.sql',
    '0011_nifty_redwing.sql',
  ])
    {sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));}
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('player', 'Player', 'player@example.com', 1, 0, 0);
  sqlite
    .prepare('INSERT INTO invitations(email,expires_at) VALUES (?,?)')
    .run('player@example.com', 1000);
  const db = {
    prepare: (query: string) => ({
      bind: (...parameters: (string | number)[]) => ({
        first: async () => sqlite.prepare(query).get(...parameters) ?? null,
      }),
    }),
  } as unknown as D1Database;
  return { sqlite, db };
}
describe('atomic invitation redemption before session creation', () => {
  it('keeps a complimentary invite valid without bypassing email verification or another redemption', async () => {
    const { db, sqlite } = fixture();
    sqlite
      .prepare("INSERT INTO complimentary_plus(email,granted_at) VALUES('player@example.com',0)")
      .run();
    await expect(admitSession(db, 'player', 1001)).resolves.toBe(true);
    sqlite.prepare("UPDATE invitations SET redeemed_by='another-account'").run();
    await expect(admitSession(db, 'player', 1002)).resolves.toBe(false);
    sqlite.prepare('UPDATE invitations SET redeemed_by=NULL').run();
    sqlite.prepare('UPDATE user SET email_verified=0').run();
    await expect(admitSession(db, 'player', 1003)).resolves.toBe(false);
  });

  it('admits verified invited email once and preserves admission after expiry', async () => {
    const { db, sqlite } = fixture();
    await expect(admitSession(db, 'player', 999)).resolves.toBe(true);
    await expect(admitSession(db, 'player', 2000)).resolves.toBe(true);
    expect(sqlite.prepare('SELECT redeemed_by,redeemed_at FROM invitations').get()).toEqual({
      redeemed_by: 'player',
      redeemed_at: 999,
    });
  });

  it('rejects expiration at exact boundary', async () => {
    const { db } = fixture();
    await expect(admitSession(db, 'player', 1000)).resolves.toBe(false);
  });

  it('rejects unverified emails, unknown users and mismatched redemption', async () => {
    const { db, sqlite } = fixture();
    sqlite.prepare('UPDATE user SET email_verified=0').run();
    await expect(admitSession(db, 'player', 1)).resolves.toBe(false);
    await expect(admitSession(db, 'unknown', 1)).resolves.toBe(false);
    sqlite.prepare('UPDATE user SET email_verified=1').run();
    sqlite.prepare('UPDATE invitations SET redeemed_by=?').run('another-account');
    await expect(admitSession(db, 'player', 1)).resolves.toBe(false);
  });

  it('refuses to recreate access after deletion starts', async () => {
    const { db, sqlite } = fixture();
    await expect(admitSession(db, 'player', 1)).resolves.toBe(true);
    sqlite
      .prepare('INSERT INTO account_deletions(user_id,requested_at) VALUES (?,?)')
      .run('player', 2);
    await expect(admitSession(db, 'player', 3)).resolves.toBe(false);
  });
});
