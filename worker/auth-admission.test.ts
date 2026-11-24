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
  ]) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
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
    // Arrange
    const { db, sqlite } = fixture();
    sqlite
      .prepare("INSERT INTO complimentary_plus(email,granted_at) VALUES('player@example.com',0)")
      .run();
    const withGrant = await admitSession(db, 'player', 1001);
    sqlite.prepare("UPDATE invitations SET redeemed_by='another-account'").run();
    const redeemedElsewhere = await admitSession(db, 'player', 1002);
    sqlite.prepare('UPDATE invitations SET redeemed_by=NULL').run();
    sqlite.prepare('UPDATE user SET email_verified=0').run();

    // Act
    const unverified = await admitSession(db, 'player', 1003);

    // Assert
    expect(withGrant).toBe(true);
    expect(redeemedElsewhere).toBe(false);
    expect(unverified).toBe(false);
  });

  it('admits verified invited email once and preserves admission after expiry', async () => {
    // Arrange
    const { db, sqlite } = fixture();
    const beforeExpiry = await admitSession(db, 'player', 999);

    // Act
    const afterExpiry = await admitSession(db, 'player', 2000);

    // Assert
    expect(beforeExpiry).toBe(true);
    expect(afterExpiry).toBe(true);
    expect(sqlite.prepare('SELECT redeemed_by,redeemed_at FROM invitations').get()).toEqual({
      redeemed_by: 'player',
      redeemed_at: 999,
    });
  });

  it('rejects expiration at exact boundary', async () => {
    // Arrange
    const { db } = fixture();

    // Act
    const admitted = await admitSession(db, 'player', 1000);

    // Assert
    expect(admitted).toBe(false);
  });

  it('rejects unverified emails, unknown users and mismatched redemption', async () => {
    // Arrange
    const { db, sqlite } = fixture();
    sqlite.prepare('UPDATE user SET email_verified=0').run();
    const unverified = await admitSession(db, 'player', 1);
    const unknown = await admitSession(db, 'unknown', 1);
    sqlite.prepare('UPDATE user SET email_verified=1').run();
    sqlite.prepare('UPDATE invitations SET redeemed_by=?').run('another-account');

    // Act
    const mismatched = await admitSession(db, 'player', 1);

    // Assert
    expect(unverified).toBe(false);
    expect(unknown).toBe(false);
    expect(mismatched).toBe(false);
  });

  it('refuses to recreate access after deletion starts', async () => {
    // Arrange
    const { db, sqlite } = fixture();
    const admitted = await admitSession(db, 'player', 1);
    sqlite
      .prepare('INSERT INTO account_deletions(user_id,requested_at) VALUES (?,?)')
      .run('player', 2);

    // Act
    const afterDeletion = await admitSession(db, 'player', 3);

    // Assert
    expect(admitted).toBe(true);
    expect(afterDeletion).toBe(false);
  });
});
