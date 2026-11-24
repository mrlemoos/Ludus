import { guestCookieName, guestMaxFinishedGames, guestSessionDays } from '../shared/guest';
import {
  clearGuestCookie,
  createGuestSession,
  guestCookieAttributes,
  guestWithinGameLimit,
  issueGuestCookie,
  parseGuestSessionBody,
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

function guestEnv(
  d1: D1Database,
  limiter: RateLimit | undefined = { limit: async () => ({ success: true }) },
) {
  return {
    BETTER_AUTH_SECRET: secret,
    DB: d1,
    GUEST_LIMITER: limiter,
  } as unknown as Env;
}

async function signedGuestCookie(d1: D1Database, language: 'en-GB' | 'es-ES' | 'fr-FR' = 'en-GB') {
  const created = await createGuestSession(
    new Request('https://ludus.test/api/guest/session'),
    guestEnv(d1),
    { adult: true, language },
  );
  const issued = await issueGuestCookie(
    new Response(null, { status: created.status }),
    guestEnv(d1),
    created.identity.id,
    false,
  );
  const raw = issued.headers.get('Set-Cookie')!.split(';')[0];
  return { id: created.identity.id, cookie: raw, name: created.identity.name };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseGuestSessionBody', () => {
  it('rejects requests without adult confirmation', () => {
    expect(parseGuestSessionBody({ adult: false })).toBeNull();
    expect(parseGuestSessionBody({})).toBeNull();
    expect(parseGuestSessionBody(null)).toBeNull();
  });

  it('defaults the language to en-GB when omitted', () => {
    expect(parseGuestSessionBody({ adult: true })).toEqual({ adult: true, language: 'en-GB' });
  });

  it('keeps a supported language when provided', () => {
    expect(parseGuestSessionBody({ adult: true, language: 'fr-FR' })).toEqual({
      adult: true,
      language: 'fr-FR',
    });
  });

  it('falls back to en-GB for an unsupported language code', () => {
    expect(parseGuestSessionBody({ adult: true, language: 'de-DE' })).toEqual({
      adult: true,
      language: 'en-GB',
    });
  });
});

describe('guestCookieAttributes', () => {
  it('omits Secure on plain HTTP development hosts', () => {
    expect(guestCookieAttributes(false)).toContain(`Max-Age=${guestSessionDays * 86_400}`);
    expect(guestCookieAttributes(false)).not.toContain('Secure');
  });

  it('adds Secure on HTTPS hosts', () => {
    expect(guestCookieAttributes(true)).toContain('Secure');
  });
});

describe('guest session cookies', () => {
  it('issues and reads a signed cookie', async () => {
    const { d1 } = memoryDb();

    const created = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      guestEnv(d1),
      { adult: true, language: 'en-GB' },
    );

    const issued = await issueGuestCookie(
      new Response(null, { status: 201 }),
      guestEnv(d1),
      created.identity.id,
      false,
    );

    const request = new Request('https://ludus.test/api/me', {
      headers: { Cookie: issued.headers.get('Set-Cookie')!.split(';')[0] },
    });

    const guest = await readGuest(request, guestEnv(d1));

    expect(created.status).toBe(201);
    expect(guest).toEqual(created.identity);
  });

  it('rejects a tampered signature', async () => {
    const { d1 } = memoryDb();
    const { cookie } = await signedGuestCookie(d1);
    const tampered = cookie.replace(/.$/, cookie.at(-1) === 'a' ? 'b' : 'a');

    const guest = await readGuest(
      new Request('https://ludus.test/api/me', { headers: { Cookie: tampered } }),
      guestEnv(d1),
    );

    expect(guest).toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const { d1 } = memoryDb();
    const env = guestEnv(d1);
    const created = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      env,
      { adult: true, language: 'en-GB' },
    );
    const issued = await issueGuestCookie(
      new Response(null, { status: 201 }),
      env,
      created.identity.id,
      false,
    );
    const cookie = issued.headers.get('Set-Cookie')!.split(';')[0];
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86_400_000);

    const guest = await readGuest(
      new Request('https://ludus.test/api/me', { headers: { Cookie: cookie } }),
      env,
    );

    now.mockRestore();
    expect(guest).toBeNull();
  });

  it('returns null when the signing secret is missing', async () => {
    const { d1 } = memoryDb();
    const { cookie } = await signedGuestCookie(d1);

    const guest = await readGuest(
      new Request('https://ludus.test/api/me', { headers: { Cookie: cookie } }),
      { DB: d1 } as unknown as Env,
    );

    expect(guest).toBeNull();
  });

  it('clears guest cookies', () => {
    const cleared = clearGuestCookie(new Response(null, { status: 204 }), false);

    expect(cleared.headers.get('Set-Cookie')).toContain(`${guestCookieName}=`);
    expect(cleared.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});

describe('createGuestSession', () => {
  it('returns rate_limited when the IP limiter rejects the request', async () => {
    const { d1 } = memoryDb();
    const env = guestEnv(d1, { limit: async () => ({ success: false }) });

    const created = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      env,
      { adult: true, language: 'en-GB' },
    );

    expect(created).toEqual({
      identity: { id: '', name: '' },
      status: 429,
      error: 'rate_limited',
    });
  });

  it('returns unavailable when the signing secret is missing', async () => {
    const { d1 } = memoryDb();

    const created = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      { DB: d1, GUEST_LIMITER: { limit: async () => ({ success: true }) } } as unknown as Env,
      { adult: true, language: 'en-GB' },
    );

    expect(created).toEqual({
      identity: { id: '', name: '' },
      status: 503,
      error: 'unavailable',
    });
  });

  it('reuses an existing guest instead of creating a duplicate row', async () => {
    const { d1 } = memoryDb();
    const env = guestEnv(d1);
    const first = await createGuestSession(
      new Request('https://ludus.test/api/guest/session'),
      env,
      { adult: true, language: 'es-ES' },
    );
    const issued = await issueGuestCookie(
      new Response(null, { status: first.status }),
      env,
      first.identity.id,
      false,
    );
    const request = new Request('https://ludus.test/api/guest/session', {
      headers: { Cookie: issued.headers.get('Set-Cookie')!.split(';')[0] },
    });

    const second = await createGuestSession(request, env, { adult: true, language: 'en-GB' });

    expect(second.status).toBe(200);
    expect(second.identity).toEqual(first.identity);
  });
});

describe('guest limits and cleanup', () => {
  it('allows guests below the finished-game cap', async () => {
    const { database, d1 } = memoryDb();
    const id = 'guest_under_cap';
    database
      .prepare('INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,0,0)')
      .run(id, 'Guest', 'guest+xy@guest.ludus');
    for (let index = 0; index < guestMaxFinishedGames - 1; index += 1) {
      database
        .prepare(
          'INSERT INTO matches(id,owner,created_at,finished_at,control,difficulty,colour,result) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(`g${index}`, id, 0, 1, '10+5', 1, 'w', '{}');
    }

    expect(await guestWithinGameLimit(d1, id)).toBe(true);
  });

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
