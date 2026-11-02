import { hasComplimentaryInvitation, hasComplimentaryPlus } from './complimentary-plus';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sql.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  const db = {
    prepare: (query: string) => ({
      bind: (...args: string[]) => ({ first: async () => sql.prepare(query).get(...args) ?? null }),
    }),
  } as unknown as D1Database;
  return { sql, db };
}

describe('complimentary Plus follows verified ownership, never trial expiry', () => {
  it('supports grants before registration and checks verified email ownership afterward', async () => {
    const { db, sql } = fixture();
    sql
      .prepare("INSERT INTO complimentary_plus(email,granted_at) VALUES('player@example.test',0)")
      .run();
    await expect(hasComplimentaryInvitation(db, 'PLAYER@example.test')).resolves.toBe(true);
    await expect(hasComplimentaryPlus(db, 'owner')).resolves.toBe(false);
    sql
      .prepare(
        "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Player','PLAYER@example.test',0,0,0)",
      )
      .run();
    await expect(hasComplimentaryPlus(db, 'owner')).resolves.toBe(false);
    sql.prepare('UPDATE user SET email_verified=1').run();
    await expect(hasComplimentaryPlus(db, 'owner')).resolves.toBe(true);
    await expect(hasComplimentaryPlus(db, 'another-owner')).resolves.toBe(false);
  });

  it('revocation and deletion stop access without modifying a beta or a subscription', async () => {
    const { db, sql } = fixture();
    sql
      .prepare(
        "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Player','player@example.test',1,0,0)",
      )
      .run();
    sql
      .prepare("INSERT INTO complimentary_plus(email,granted_at) VALUES('player@example.test',0)")
      .run();
    sql.prepare('UPDATE complimentary_plus SET revoked_at=1').run();
    await expect(hasComplimentaryPlus(db, 'owner')).resolves.toBe(false);
    sql.prepare('UPDATE complimentary_plus SET revoked_at=NULL').run();
    sql.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
    await expect(hasComplimentaryPlus(db, 'owner')).resolves.toBe(false);
    expect(sql.prepare('SELECT * FROM billing_subscriptions').all()).toEqual([]);
    expect(sql.prepare('SELECT * FROM player_profiles').all()).toEqual([]);
  });
});
