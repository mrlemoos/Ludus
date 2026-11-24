import { guestMaxFinishedGames } from '../shared/guest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('./auth', () => ({
  authFor: () => ({ api: { getSession: auth.session }, handler: vi.fn() }),
  localDevelopment: () => false,
}));
import { gameApi } from './game-api';

const secret = 'test-guest-secret-32-bytes-minimum!';
const origin = 'https://ludus.test';

function memoryDb() {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    database.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  function statement(sql: string, values: (string | number | null)[] = []) {
    return {
      bind: (...args: (string | number | null)[]) => statement(sql, args),
      first: async () => database.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: database.prepare(sql).all(...values) }),
      run: async () => ({ meta: { changes: database.prepare(sql).run(...values).changes } }),
    };
  }
  return {
    database,
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

function guestEnv(d1: D1Database) {
  return {
    BETTER_AUTH_SECRET: secret,
    DB: d1,
    GUEST_LIMITER: { limit: async () => ({ success: true }) },
    MATCHES: { getByName: () => ({ read: vi.fn(), act: vi.fn(), fetch: vi.fn() }) },
    MATCHMAKING: {
      getByName: () => ({ reserveComputer: vi.fn().mockResolvedValue({ reserved: true }) }),
    },
  } as unknown as Env;
}

function request(path: string, init?: RequestInit) {
  return new Request(`${origin}${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.session.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guest game API', () => {
  it('requires adult confirmation to start a guest session', async () => {
    const { d1 } = memoryDb();

    const response = await gameApi(
      request('/api/guest/session', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: false, language: 'en-GB' }),
      }),
      guestEnv(d1),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'adult_confirmation_required' });
  });

  it('issues a guest session cookie and reports guest identity on /api/me', async () => {
    const { d1 } = memoryDb();

    const created = await gameApi(
      request('/api/guest/session', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: true, language: 'en-GB' }),
      }),
      guestEnv(d1),
    );
    const cookie = created.headers.get('Set-Cookie');

    const me = await gameApi(
      request('/api/me', { headers: { Cookie: cookie!.split(';')[0] } }),
      guestEnv(d1),
    );

    expect(created.status).toBe(201);
    expect(cookie).toContain('ludus_guest=');
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ guest: true, user: { name: 'Guest' } });
  });

  it('prefers a Better Auth session over a guest cookie', async () => {
    const { d1 } = memoryDb();
    auth.session.mockResolvedValue({ user: { id: 'signed-in', name: 'Invited' } });
    const created = await gameApi(
      request('/api/guest/session', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: true, language: 'en-GB' }),
      }),
      guestEnv(d1),
    );
    const cookie = created.headers.get('Set-Cookie')!;

    const me = await gameApi(
      request('/api/me', { headers: { Cookie: cookie.split(';')[0] } }),
      guestEnv(d1),
    );

    await expect(me.json()).resolves.toEqual({
      user: { id: 'signed-in', name: 'Invited' },
      guest: false,
      local: false,
    });
  });

  it('returns guest_limit_reached when creating a game beyond the lifetime cap', async () => {
    const { database, d1 } = memoryDb();
    const created = await gameApi(
      request('/api/guest/session', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: true, language: 'en-GB' }),
      }),
      guestEnv(d1),
    );
    const body = (await created.json()) as { user: { id: string } };
    for (let index = 0; index < guestMaxFinishedGames; index += 1) {
      database
        .prepare(
          'INSERT INTO matches(id,owner,created_at,finished_at,control,difficulty,colour,result) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(`finished-${index}`, body.user.id, 0, 1, '10+5', 1, 'w', '{}');
    }
    const cookie = created.headers.get('Set-Cookie')!;

    const blocked = await gameApi(
      request('/api/games', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: cookie.split(';')[0],
        },
        body: JSON.stringify({ control: '10+5', difficulty: 2, colour: 'w' }),
      }),
      guestEnv(d1),
    );

    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toEqual({ error: 'guest_limit_reached' });
  });

  it('clears the guest cookie on sign-out', async () => {
    const { d1 } = memoryDb();
    const created = await gameApi(
      request('/api/guest/session', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: true, language: 'en-GB' }),
      }),
      guestEnv(d1),
    );
    const cookie = created.headers.get('Set-Cookie')!;

    const signedOut = await gameApi(
      request('/api/guest/sign-out', {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie.split(';')[0] },
      }),
      guestEnv(d1),
    );

    expect(signedOut.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
