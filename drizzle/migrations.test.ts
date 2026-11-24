import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';

const migrations = readdirSync('drizzle')
  .filter((file) => file.endsWith('.sql'))
  .sort();

function upgradedDatabase() {
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
  return db;
}

const db = upgradedDatabase();

afterAll(() => {
  db.close();
});

describe('database upgrades', () => {
  it('passes the foreign key check', () => {
    // Arrange

    // Act
    const violations = db.prepare('PRAGMA foreign_key_check').all();

    // Assert
    expect(violations).toEqual([]);
  });

  it('preserves the existing player through beta upgrades', () => {
    // Arrange

    // Act
    const player = db.prepare('SELECT name,email FROM user WHERE id=?').get('existing');

    // Assert
    expect(player).toEqual({
      name: 'Existing',
      email: 'old@example.test',
    });
  });

  it('gives the retained match its beta defaults', () => {
    // Arrange

    // Act
    const match = db.prepare('SELECT control,difficulty,colour FROM matches').get();

    // Assert
    expect(match).toEqual({
      control: '5+3',
      difficulty: 1,
      colour: 'w',
    });
  });

  it('sets an invitation expiry during the upgrade', () => {
    // Arrange

    // Act
    const invitation = db.prepare('SELECT expires_at FROM invitations').get();

    // Assert
    expect(invitation?.expires_at).toBeGreaterThan(0);
  });

  it('adds profile bookkeeping columns', () => {
    // Arrange

    // Act
    const columns = db
      .prepare('PRAGMA table_info(player_profiles)')
      .all()
      .map((column) => column.name);

    // Assert
    expect(columns).toContain('mutation_id');
    expect(columns).toContain('trial_expires_at');
  });

  it('creates the beta tables', () => {
    // Arrange

    // Act
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('invitation_batches','coach_requests','ratings','player_cosmetics')",
      )
      .all();

    // Assert
    expect(tables).toHaveLength(4);
  });
});
