import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
const migrations = readdirSync('drizzle')
  .filter((file) => file.endsWith('.sql'))
  .sort();
describe('database upgrades', () => {
  it('applies every migration from empty and preserves existing players through beta upgrades', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of migrations) {
      db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
      if (file.startsWith('0001_')) {
        db.prepare(
          "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('existing','Existing','old@example.test',1,0,0)",
        ).run();
        db.prepare("INSERT INTO invitations(email) VALUES('old@example.test')").run();
        db.prepare(
          "INSERT INTO matches(id,owner,created_at) VALUES('retained-game','existing',0)",
        ).run();
      }
    }
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT name,email FROM user WHERE id=?').get('existing')).toEqual({
      name: 'Existing',
      email: 'old@example.test',
    });
    expect(db.prepare('SELECT control,difficulty,colour FROM matches').get()).toEqual({
      control: '5+3',
      difficulty: 1,
      colour: 'w',
    });
    expect(db.prepare('SELECT expires_at FROM invitations').get()?.expires_at).toBeGreaterThan(0);
    const columns = db
      .prepare('PRAGMA table_info(player_profiles)')
      .all()
      .map((column) => column.name);
    expect(columns).toContain('mutation_id');
    expect(columns).toContain('trial_expires_at');
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('invitation_batches','coach_requests','ratings','player_cosmetics')",
        )
        .all(),
    ).toHaveLength(4);
    db.close();
  });
});
