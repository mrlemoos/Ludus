import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  authFor: () => ({ api: { getSession: async () => ({ user: { id: 'owner' } }) } }),
  localDevelopment: () => false,
}));
import { createGame } from '../shared/game';
import { gameApi } from './game-api';

function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  db.prepare(
    "INSERT INTO user(id,name,email,created_at,updated_at) VALUES('owner','Owner','owner@example.test',0,0)",
  ).run();
  db.prepare(
    "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES('owner','Owner','en-GB','UTC','casual','developing',0,'v1',0,0)",
  ).run();
  function statement(sql: string, values: (string | number | null)[] = []) {
    return {
      bind: (...args: (string | number | null)[]) => statement(sql, args),
      first: async () => db.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...values) }),
      raw: async () =>
        db
          .prepare(sql)
          .all(...values)
          .map((row) => Object.values(row)),
      run: async () => ({ meta: { changes: db.prepare(sql).run(...values).changes } }),
    };
  }
  const reserveComputer = vi.fn().mockResolvedValue({ reserved: true });
  const releaseComputer = vi.fn();
  const stub = {
    read: vi.fn().mockResolvedValue(null),
    initialise: vi.fn(async (id, owner, control, difficulty, colour) =>
      createGame(id, owner, control, difficulty, colour, 0),
    ),
  };
  const env = {
    DB: { prepare: statement },
    MATCHES: { getByName: () => stub },
    MATCHMAKING: { getByName: () => ({ reserveComputer, releaseComputer }) },
  } as unknown as Env;
  return { db, stub, env, reserveComputer, releaseComputer };
}
function request(control = '10+5', difficulty = 4) {
  return new Request('https://ludus.test/api/games', {
    method: 'POST',
    headers: { Origin: 'https://ludus.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ control, difficulty, colour: 'b' }),
  });
}
afterEach(() => vi.restoreAllMocks());
describe('computer creation recovery', () => {
  it('resumes the same persisted creation settings after interrupted durable initialisation', async () => {
    const f = fixture();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    f.stub.initialise.mockRejectedValueOnce(new Error('interrupted'));
    expect((await gameApi(request(), f.env)).status).toBe(503);
    const persisted = f.db.prepare('SELECT * FROM matches').get()!;
    const retry = await gameApi(request('5+3', 1), f.env);
    expect(retry.status).toBe(200);
    expect(f.stub.initialise).toHaveBeenLastCalledWith(persisted.id, 'owner', '10+5', 4, 'b');
    expect(f.db.prepare('SELECT count(*) AS count FROM matches').get()).toEqual({ count: 1 });
  });

  it('blocks a late creation after deletion and releases its coordinator reservation', async () => {
    const f = fixture();
    f.reserveComputer.mockImplementation(async () => {
      f.db.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
      return { reserved: true };
    });
    expect((await gameApi(request(), f.env)).status).toBe(403);
    expect(f.stub.initialise).not.toHaveBeenCalled();
    expect(f.releaseComputer).toHaveBeenCalledTimes(1);
    expect(f.db.prepare('SELECT count(*) AS count FROM matches').get()).toEqual({ count: 0 });
  });
});
