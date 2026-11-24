import { guestCookieName, guestMaxFinishedGames } from '../shared/guest';
import {
  clearGuestCookie,
  createGuestSession,
  guestWithinGameLimit,
  issueGuestCookie,
  purgeGuestUsers,
  readGuest,
} from './guest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

const secret = 'test-guest-secret-32-bytes-minimum!';

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  function statement(sql: string, values: (string | number | null)[] = []) {
    return {
      bind: (...args: (string | number | null)[]) => statement(sql, args),
      first: async () => db.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...values) }),
      run: async () => ({ meta: { changes: db.prepare(sql).run(...values).changes } }),
    };
  }
  return {
    database: db,
    d1: {
      prepare: statement,
      batch: async (entries: { run: () => Promise<unknown> }[]) => {
        for (const entry of entries) {
          await entry.run();
        }
      },
    } as unknown as D1Database,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guest session cookies', () => {
  it('issues and reads a signed cookie', async () => {
    const { d1 } = memoryDb();
    const created = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      {
        BETTER_AUTH_SECRET: secret,
        DB: d1,
        GUEST_LIMITER: { limit: async () => ({ success: true }) },
      } as unknown as Env,
      { adult: true, language: 'en-GB' },
    );
    expect(created.status).toBe(201);
    const issued = await issueGuestCookie(
      new Response(null, { status: 201 }),
      { BETTER_AUTH_SECRET: secret } as unknown as Env,
      created.identity.id,
      false,
    );
    const request = new Request('https://ludus.test/api/me', {
      headers: { Cookie: issued.headers.get('Set-Cookie')!.split(';')[0] },
    });
    const guest = await readGuest(request, {
      BETTER_AUTH_SECRET: secret,
      DB: d1,
    } as unknown as Env);
    expect(guest).toEqual(created.identity);
  });

  it('clears guest cookies', () => {
    const cleared = clearGuestCookie(new Response(null, { status: 204 }), false);
    expect(cleared.headers.get('Set-Cookie')).toContain(`${guestCookieName}=`);
    expect(cleared.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});

describe('guest limits and cleanup', () => {
  it('enforces the finished-game cap', async () => {
    const { database, d1 } = memoryDb();
    const id = 'guest_test';
    database
      .prepare('INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,0,0)')
      .run(id, 'Guest', 'guest+xy@guest.ludus');
    for (let index = 0; index < guestMaxFinishedGames; index += 1) {
      database
        .prepare(
          'INSERT INTO matches(id,owner,created_at,finished_at,control,difficulty,colour,result) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(`g${index}`, id, 0, 1, '10+5', 1, 'w', '{}');
    }
    expect(await guestWithinGameLimit(d1, id)).toBe(false);
  });

  it('purges stale guest users', async () => {
    const { database, d1 } = memoryDb();
    database
      .prepare(
        "INSERT INTO user(id,name,email,created_at,updated_at) VALUES('guest_old','Guest','guest+old@guest.ludus',0,0)",
      )
      .run();
    database
      .prepare(
        "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES('guest_old','guest','en-GB','UTC','casual','beginner',0,'v',0,0)",
      )
      .run();
    await purgeGuestUsers(d1, 30 * 86_400_000 + 1);
    expect(database.prepare('SELECT count(*) AS count FROM user').get()).toEqual({ count: 0 });
  });
});
