import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const authentication = vi.hoisted(() => ({ session: vi.fn() }));
const billing = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock('./auth', () => ({
  authFor: () => ({ api: { getSession: authentication.session } }),
}));
vi.mock('./billing', () => ({ cancelAccountBilling: billing.cancel }));
import {
  accountsApi,
  loadPlayerProfile,
  purgeExpiredPersonalData,
  readPublicProfile,
  recordActivity,
} from './accounts';
import { profileSitemap, publicProfileSeo, serialisePublicProfile } from './profile-seo';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((file) => file.endsWith('.sql'))
    .sort())
    {sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));}
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('owner', 'Owner', 'owner@example.com', 1, 0, 0);
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('other', 'Other', 'other@example.com', 1, 0, 0);
  function statement(query: string, parameters: unknown[] = []) {
    const bindings = parameters as (string | number | null)[];
    return {
      bind: (...values: unknown[]) => statement(query, values),
      first: async () => sqlite.prepare(query).get(...bindings) ?? null,
      all: async () => ({ results: sqlite.prepare(query).all(...bindings) }),
      run: () => ({ meta: { changes: sqlite.prepare(query).run(...bindings).changes } }),
    };
  }
  const db = {
    prepare: (query: string) => statement(query),
    batch: async (queries: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const query of queries) {results.push(query.run());}
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const anonymise = vi.fn().mockResolvedValue(undefined),
    removeUser = vi.fn().mockResolvedValue(undefined);
  return {
    sqlite,
    db,
    anonymise,
    removeUser,
    env: {
      DB: db,
      OPERATOR_IDS: 'owner',
      RESEND_API_KEY: 'test',
      AUTH_EMAIL_FROM: 'invites@example.com',
      MATCHES: { getByName: () => ({ anonymise }) },
      HUMAN_MATCHES: { getByName: () => ({ anonymise }) },
      MATCHMAKING: { getByName: () => ({ removeUser }) },
    } as unknown as Env,
  };
}
const profile = {
  username: 'OwnerPlayer',
  language: 'en-GB',
  timezone: 'Europe/Madrid',
  chessLevel: 'casual',
  teachingProfile: 'developing',
  adult: true,
  activityPublic: true,
};
function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`https://ludus.example${path}`, {
    method,
    headers: { Origin: 'https://ludus.example', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  billing.cancel.mockReset().mockResolvedValue(undefined);
  authentication.session.mockResolvedValue({
    user: { id: 'owner', email: 'owner@example.com', emailVerified: true },
  });
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-30T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('account lifecycle with real SQLite migrations', () => {
  it('keeps deletion pending and retryable until billing cancellation succeeds', async () => {
    const { env, sqlite } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    sqlite
      .prepare(
        "INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES('s',9999999999999,'token',0,0,'owner')",
      )
      .run();
    billing.cancel.mockRejectedValueOnce(new Error('offline'));
    const pending = await accountsApi(
      request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
      env,
    );
    expect(pending!.status).toBe(202);
    expect(await pending!.json()).toEqual({ deletionPending: true });
    expect(sqlite.prepare('SELECT * FROM player_profiles').all()).toHaveLength(1);
    expect(sqlite.prepare('SELECT * FROM session').all()).toHaveLength(1);
    expect((await accountsApi(request('/api/account', 'GET'), env))!.status).toBe(202);
    expect((await accountsApi(request('/api/account', 'POST', profile), env))!.status).toBe(403);
    expect(
      (await accountsApi(request('/api/account', 'DELETE', { confirmation: 'DELETE' }), env))!
        .status,
    ).toBe(200);
    expect(sqlite.prepare('SELECT * FROM player_profiles').all()).toHaveLength(0);
    expect(sqlite.prepare('SELECT * FROM session').all()).toHaveLength(0);
  });
  it('restricts billing review to operators and resolves cases without changing entitlements', async () => {
    const { env, sqlite } = fixture();
    sqlite
      .prepare(
        "INSERT INTO billing_review_cases(id,owner,reason,resource,created_at) VALUES('case','owner','late_payment','in_fixture',0)",
      )
      .run();
    env.OPERATOR_IDS = 'other';
    expect((await accountsApi(request('/api/operator/billing'), env))!.status).toBe(403);
    env.OPERATOR_IDS = 'owner';
    expect((await accountsApi(request('/api/operator/billing'), env))!.status).toBe(200);
    expect(
      (await accountsApi(request('/api/operator/billing', 'POST', { caseId: 'case' }), env))!
        .status,
    ).toBe(200);
    expect(sqlite.prepare('SELECT resolved_at FROM billing_review_cases').get()?.resolved_at).toBe(
      Date.now(),
    );
    expect(sqlite.prepare('SELECT * FROM billing_invoice_access').all()).toEqual([]);
  });
  it('serialises conflicting onboarding attempts without changing the winning timezone or trial', async () => {
    const { env, sqlite } = fixture();
    const results = await Promise.all([
      accountsApi(request('/api/account', 'POST', profile), env),
      accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'Asia/Tokyo' }), env),
    ]);
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT timezone FROM player_profiles').all()).toEqual(
      sqlite.prepare('SELECT timezone FROM timezone_history').all(),
    );
  });
  it('starts the card-free trial once and never renews it on profile updates', async () => {
    const { env, db } = fixture();
    expect((await accountsApi(request('/api/account', 'POST', profile), env))?.status).toBe(200);
    const first = await loadPlayerProfile(db, 'owner');
    expect(first?.trialExpiresAt).toBe(Date.now() + 30 * 86400000);
    vi.advanceTimersByTime(86400000);
    expect(
      (
        await accountsApi(
          request('/api/account', 'POST', { ...profile, teachingProfile: 'club' }),
          env,
        )
      )?.status,
    ).toBe(200);
    const updated = await loadPlayerProfile(db, 'owner');
    expect(updated?.trialExpiresAt).toBe(first?.trialExpiresAt);
    expect(updated?.adultAttestedAt).toBe(first?.adultAttestedAt);
    expect(updated?.teachingProfile).toBe('club');
  });

  it('protects case-insensitive usernames and validates adult attestation', async () => {
    const { env } = fixture();
    expect(
      (await accountsApi(request('/api/account', 'POST', { ...profile, adult: false }), env))
        ?.status,
    ).toBe(400);
    await accountsApi(request('/api/account', 'POST', profile), env);
    authentication.session.mockResolvedValue({
      user: { id: 'other', email: 'other@example.com', emailVerified: true },
    });
    expect(
      (
        await accountsApi(
          request('/api/account', 'POST', { ...profile, username: 'ownerplayer' }),
          env,
        )
      )?.status,
    ).toBe(409);
  });

  it('hides private activity at the public API boundary without leaking private profile fields', async () => {
    const { env, db } = fixture();
    await accountsApi(request('/api/account', 'POST', { ...profile, activityPublic: false }), env);
    await recordActivity(db, {
      gameId: 'mate',
      players: ['owner'],
      reason: 'checkmate',
      moves: 4,
      completedAt: Date.now(),
    });
    authentication.session.mockResolvedValue(null);
    const result = await accountsApi(request('/api/profiles/OwnerPlayer'), env);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({
      username: 'OwnerPlayer',
      activityPublic: false,
      ratings: [
        { control: '5+3', rating: 1500, deviation: 350, games: 0 },
        { control: '10+5', rating: 1500, deviation: 350, games: 0 },
      ],
    });
  });

  it('attributes activity once using historical timezone despite later changes', async () => {
    const { env, db, sqlite } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    const completedAt = Date.parse('2026-10-30T23:30:00Z');
    await accountsApi(
      request('/api/account', 'POST', { ...profile, timezone: 'America/Sao_Paulo' }),
      env,
    );
    vi.setSystemTime(Date.parse('2026-10-31T12:00:00Z'));
    await accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'Asia/Tokyo' }), env);
    const input = {
      gameId: 'game',
      players: ['owner', 'owner'],
      reason: 'timeout',
      moves: 10,
      completedAt,
    };
    await recordActivity(db, input);
    await recordActivity(db, input);
    expect(sqlite.prepare('SELECT date,timezone FROM activity_events').all()).toEqual([
      { date: '2026-10-30', timezone: 'America/Sao_Paulo' },
    ]);
  });

  it('revokes sessions, removes private data, anonymises references and blocks deleted-account access', async () => {
    const { env, sqlite, anonymise, removeUser } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    authentication.session.mockResolvedValue({
      user: { id: 'other', email: 'other@example.com', emailVerified: true },
    });
    await accountsApi(
      request('/api/account', 'POST', { ...profile, username: 'OtherPlayer' }),
      env,
    );
    authentication.session.mockResolvedValue({
      user: { id: 'owner', email: 'owner@example.com', emailVerified: true },
    });
    sqlite
      .prepare('INSERT INTO matches(id,owner,created_at) VALUES (?,?,?)')
      .run('game', 'owner', 0);
    sqlite
      .prepare(
        'INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)',
      )
      .run('session', 9999999999999, 'secret', 0, 0, 'owner');
    const result = await accountsApi(
      request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
      env,
    );
    expect(result?.status).toBe(200);
    expect(sqlite.prepare('SELECT * FROM session').all()).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM player_profiles WHERE user_id=?').all('owner')).toEqual(
      [],
    );
    expect(sqlite.prepare('SELECT name,email FROM user WHERE id=?').get('owner')).toEqual({
      name: 'Deleted player',
      email: 'owner@deleted.invalid',
    });
    expect(anonymise).toHaveBeenCalledWith('owner');
    expect(removeUser).toHaveBeenCalledWith('owner');
    expect((await accountsApi(request('/api/account'), env))?.status).toBe(403);
    authentication.session.mockResolvedValue({
      user: { id: 'other', email: 'other@example.com', emailVerified: true },
    });
    expect((await accountsApi(request('/api/profiles/OwnerPlayer'), env))?.status).toBe(404);
    const other = await accountsApi(request('/api/account'), env);
    expect(await other?.json()).toMatchObject({
      profile: { userId: 'other', username: 'OtherPlayer' },
    });
  });
  it('cleans expired personal data while keeping admitted and recently invited members', async () => {
    const { db, sqlite } = fixture();
    const old = Math.floor((Date.now() - 181 * 86400000) / 1000);
    for (const email of ['old@example.com', 'admitted@example.com', 'expired@example.com'])
      {sqlite
        .prepare('INSERT INTO waitlist(email,language,created_at) VALUES (?,?,?)')
        .run(email, 'en-GB', old);}
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at,redeemed_by) VALUES (?,?,?)')
      .run('admitted@example.com', 0, 'owner');
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at) VALUES (?,?)')
      .run('expired@example.com', Date.now() - 31 * 86400000);
    await purgeExpiredPersonalData(db);
    expect(sqlite.prepare('SELECT email FROM waitlist').all()).toEqual([
      { email: 'admitted@example.com' },
    ]);
    expect(sqlite.prepare('SELECT email FROM invitations').all()).toEqual([
      { email: 'admitted@example.com' },
    ]);
  });
});

describe('operator invitation batches', () => {
  it('does not merge different recipient lists racing for one batch ID', async () => {
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com'])
      {sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');}
    const batchId = crypto.randomUUID();
    const results = await Promise.all(
      ['first@example.com', 'second@example.com'].map((email) =>
        accountsApi(
          request('/api/operator/invitations/preview', 'POST', { batchId, emails: [email] }),
          env,
        ),
      ),
    );
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM invitation_deliveries').get()).toEqual({
      count: 1,
    });
  });
  it('stops at delivery failure and refuses a blind retry beyond the provider idempotency window', async () => {
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com'])
      {sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');}
    const batchId = crypto.randomUUID();
    await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId,
        emails: ['first@example.com', 'second@example.com'],
      }),
      env,
    );
    const send = vi.fn().mockRejectedValue(new Error('provider timeout'));
    vi.stubGlobal('fetch', send);
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
          env,
        )
      )?.status,
    ).toBe(503);
    expect(send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(24 * 3600000);
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
          env,
        )
      )?.status,
    ).toBe(409);
    expect(send).toHaveBeenCalledOnce();
    expect(sqlite.prepare('SELECT sent_at FROM invitation_deliveries').all()).toEqual([
      { sent_at: null },
      { sent_at: null },
    ]);
  });
  it('requires explicit reissue before replacing a still-valid pending invitation', async () => {
    const { env, sqlite } = fixture();
    sqlite
      .prepare('INSERT INTO waitlist(email,language) VALUES (?,?)')
      .run('beta@example.com', 'en-GB');
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at,delivery_id) VALUES (?,?,?)')
      .run('beta@example.com', Date.now() + 86400000, 'old-delivery');
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    const first = crypto.randomUUID();
    await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId: first,
        emails: ['beta@example.com'],
      }),
      env,
    );
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/send', 'POST', {
            batchId: first,
            capacityConfirmed: true,
          }),
          env,
        )
      )?.status,
    ).toBe(409);
    expect(send).not.toHaveBeenCalled();
    const reissue = crypto.randomUUID();
    await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId: reissue,
        emails: ['beta@example.com'],
        reissue: true,
      }),
      env,
    );
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/send', 'POST', {
            batchId: reissue,
            capacityConfirmed: true,
          }),
          env,
        )
      )?.status,
    ).toBe(200);
    expect(send).toHaveBeenCalledOnce();
  });
  it('denies unverified or unlisted operators before accessing the waitlist', async () => {
    const { env } = fixture();
    authentication.session.mockResolvedValue({ user: { id: 'owner', emailVerified: false } });
    expect((await accountsApi(request('/api/operator/waitlist'), env))?.status).toBe(403);
    authentication.session.mockResolvedValue({ user: { id: 'other', emailVerified: true } });
    expect((await accountsApi(request('/api/operator/waitlist'), env))?.status).toBe(403);
  });
  it('previews and delivers at most ten with stable idempotency keys and safe retries', async () => {
    const { env, sqlite } = fixture();
    sqlite
      .prepare('INSERT INTO waitlist(email,language) VALUES (?,?)')
      .run('beta@example.com', 'fr-FR');
    const batchId = '12345678-1234-1234-1234-123456789abc';
    const preview = await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId,
        emails: ['beta@example.com'],
      }),
      env,
    );
    expect(preview?.status).toBe(200);
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    expect(
      (await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId }), env))
        ?.status,
    ).toBe(400);
    const input = request('/api/operator/invitations/send', 'POST', {
      batchId,
      capacityConfirmed: true,
    });
    expect((await accountsApi(input, env))?.status).toBe(200);
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
          env,
        )
      )?.status,
    ).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      `ludus-invite/${(sqlite.prepare('SELECT id FROM invitation_deliveries').get() as { id: string }).id}`,
    );
    expect(
      sqlite.prepare('SELECT expires_at FROM invitations WHERE email=?').get('beta@example.com'),
    ).toEqual({ expires_at: Date.now() + 7 * 86400000 });
    expect(
      (
        await accountsApi(
          request('/api/operator/invitations/preview', 'POST', {
            batchId: crypto.randomUUID(),
            emails: Array(11).fill('beta@example.com'),
          }),
          env,
        )
      )?.status,
    ).toBe(400);
  });
});

it('anonymises retained human matches while deleting an account', async () => {
  const f = fixture();
  f.sqlite
    .prepare(
      "INSERT INTO online_matches(id,white_id,black_id,control,rated) VALUES('human','owner','other','5+3',0)",
    )
    .run();
  const response = await accountsApi(
    request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
    f.env,
  );
  expect(response?.status).toBe(200);
  expect(f.anonymise).toHaveBeenCalledWith('owner');
});

describe('public profile SEO privacy and discovery', () => {
  it('shares the API privacy boundary and removes deletion-pending profiles from discovery', async () => {
    const { env, db, sqlite } = fixture();
    await accountsApi(request('/api/account', 'POST', { ...profile, activityPublic: false }), env);
    await recordActivity(db, {
      gameId: 'private-game',
      players: ['owner'],
      reason: 'checkmate',
      moves: 20,
      completedAt: Date.now(),
    });
    const data = await readPublicProfile(db, profile.username);
    expect(data).toMatchObject({ username: profile.username, activityPublic: false });
    expect(data).not.toHaveProperty('activity');
    for (const privateKey of ['email', 'userId', 'timezone', 'teachingProfile', 'trialExpiresAt'])
      {expect(data).not.toHaveProperty(privateKey);}
    expect(await (await profileSitemap(db, '/sitemaps/profiles-1.xml')).text()).toContain(
      '/@ownerplayer',
    );
    sqlite.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
    expect(await readPublicProfile(db, profile.username)).toBeNull();
    expect(await (await profileSitemap(db, '/sitemap.xml')).text()).not.toContain(
      '/sitemaps/profiles-1.xml',
    );
    expect((await profileSitemap(db, '/sitemaps/profiles-1.xml')).status).toBe(404);
  });

  it('paginates discovery beyond one thousand players without repeating entries', async () => {
    const { db, sqlite } = fixture();
    const addUser = sqlite.prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    );
    const addProfile = sqlite.prepare(
      "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,activity_public,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES(?,?,'en-GB','UTC','casual','club',1,0,'fixture',0,1)",
    );
    sqlite.exec('BEGIN');
    for (let index = 0; index < 1001; index++) {
      const username = `player${String(index).padStart(4, '0')}`;
      addUser.run(username, username, `${username}@example.com`, 1, 0, 0);
      addProfile.run(username, username);
    }
    sqlite.exec('COMMIT');
    const index = await (await profileSitemap(db, '/sitemap.xml')).text();
    expect(index).toContain('profiles-2.xml');
    expect(index).not.toContain('profiles-3.xml');
    const first = await (await profileSitemap(db, '/sitemaps/profiles-1.xml')).text();
    const second = await (await profileSitemap(db, '/sitemaps/profiles-2.xml')).text();
    expect(first.match(/<url>/g)).toHaveLength(1000);
    expect(second.match(/<url>/g)).toHaveLength(1);
    expect(first).not.toContain('/@player1000');
    expect(second).toContain('/@player1000');
    expect((await profileSitemap(db, '/sitemaps/profiles-9007199254740992.xml')).status).toBe(404);
  });

  it('returns a retryable 503 when the HTML template is unavailable', async () => {
    const { env } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    env.ASSETS = {
      fetch: async () => new Response(null, { status: 503 }),
      connect: () => {
        throw new Error('unused');
      },
    };
    const response = await publicProfileSeo(request('/@ownerplayer'), env);
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serialises public bootstrap JSON without allowing an injected closing script tag', () => {
    const text = serialisePublicProfile({
      username: '</script><script>alert(1)</script>',
      data: null,
      missing: true,
    });
    expect(text).not.toContain('<');
    expect(JSON.parse(text).username).toBe('</script><script>alert(1)</script>');
  });
});
