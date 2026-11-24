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
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
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
        for (const query of queries) {
          results.push(query.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const anonymise = vi.fn().mockResolvedValue(undefined);
  const removeUser = vi.fn().mockResolvedValue(undefined);
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
    // Arrange
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
    const profilesWhilePending = sqlite.prepare('SELECT * FROM player_profiles').all();
    const sessionsWhilePending = sqlite.prepare('SELECT * FROM session').all();
    const pendingRead = await accountsApi(request('/api/account', 'GET'), env);
    const blockedUpdate = await accountsApi(request('/api/account', 'POST', profile), env);

    // Act
    const deleted = await accountsApi(
      request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
      env,
    );

    // Assert
    expect(pending!.status).toBe(202);
    await expect(pending!.json()).resolves.toEqual({ deletionPending: true });
    expect(profilesWhilePending).toHaveLength(1);
    expect(sessionsWhilePending).toHaveLength(1);
    expect(pendingRead!.status).toBe(202);
    expect(blockedUpdate!.status).toBe(403);
    expect(deleted!.status).toBe(200);
    expect(sqlite.prepare('SELECT * FROM player_profiles').all()).toHaveLength(0);
    expect(sqlite.prepare('SELECT * FROM session').all()).toHaveLength(0);
  });

  it('restricts billing review to operators and resolves cases without changing entitlements', async () => {
    // Arrange
    const { env, sqlite } = fixture();
    sqlite
      .prepare(
        "INSERT INTO billing_review_cases(id,owner,reason,resource,created_at) VALUES('case','owner','late_payment','in_fixture',0)",
      )
      .run();
    env.OPERATOR_IDS = 'other';
    const denied = await accountsApi(request('/api/operator/billing'), env);
    env.OPERATOR_IDS = 'owner';
    const listed = await accountsApi(request('/api/operator/billing'), env);

    // Act
    const resolved = await accountsApi(
      request('/api/operator/billing', 'POST', { caseId: 'case' }),
      env,
    );

    // Assert
    expect(denied!.status).toBe(403);
    expect(listed!.status).toBe(200);
    expect(resolved!.status).toBe(200);
    expect(sqlite.prepare('SELECT resolved_at FROM billing_review_cases').get()?.resolved_at).toBe(
      Date.now(),
    );
    expect(sqlite.prepare('SELECT * FROM billing_invoice_access').all()).toEqual([]);
  });

  it('serialises conflicting onboarding attempts without changing the winning timezone or trial', async () => {
    // Arrange
    const { env, sqlite } = fixture();

    // Act
    const results = await Promise.all([
      accountsApi(request('/api/account', 'POST', profile), env),
      accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'Asia/Tokyo' }), env),
    ]);

    // Assert
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT timezone FROM player_profiles').all()).toEqual(
      sqlite.prepare('SELECT timezone FROM timezone_history').all(),
    );
  });

  it('starts the card-free trial once and never renews it on profile updates', async () => {
    // Arrange
    const { env, db } = fixture();
    const created = await accountsApi(request('/api/account', 'POST', profile), env);
    const first = await loadPlayerProfile(db, 'owner');
    const initialTrial = Date.now() + 30 * 86_400_000;
    vi.advanceTimersByTime(86_400_000);

    // Act
    const updatedResponse = await accountsApi(
      request('/api/account', 'POST', { ...profile, teachingProfile: 'club' }),
      env,
    );

    // Assert
    expect(created?.status).toBe(200);
    expect(first?.trialExpiresAt).toBe(initialTrial);
    expect(updatedResponse?.status).toBe(200);
    const updated = await loadPlayerProfile(db, 'owner');
    expect(updated?.trialExpiresAt).toBe(first?.trialExpiresAt);
    expect(updated?.adultAttestedAt).toBe(first?.adultAttestedAt);
    expect(updated?.teachingProfile).toBe('club');
  });

  it('protects case-insensitive usernames and validates adult attestation', async () => {
    // Arrange
    const { env } = fixture();
    const minor = await accountsApi(
      request('/api/account', 'POST', { ...profile, adult: false }),
      env,
    );
    await accountsApi(request('/api/account', 'POST', profile), env);
    authentication.session.mockResolvedValue({
      user: { id: 'other', email: 'other@example.com', emailVerified: true },
    });

    // Act
    const duplicate = await accountsApi(
      request('/api/account', 'POST', { ...profile, username: 'ownerplayer' }),
      env,
    );

    // Assert
    expect(minor?.status).toBe(400);
    expect(duplicate?.status).toBe(409);
  });

  it('hides private activity at the public API boundary without leaking private profile fields', async () => {
    // Arrange
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

    // Act
    const result = await accountsApi(request('/api/profiles/OwnerPlayer'), env);

    // Assert
    expect(result?.status).toBe(200);
    await expect(result?.json()).resolves.toEqual({
      username: 'OwnerPlayer',
      activityPublic: false,
      ratings: [
        { control: '5+3', rating: 1500, deviation: 350, games: 0 },
        { control: '10+5', rating: 1500, deviation: 350, games: 0 },
      ],
    });
  });

  it('attributes activity once using historical timezone despite later changes', async () => {
    // Arrange
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

    // Act
    await recordActivity(db, input);

    // Assert
    expect(sqlite.prepare('SELECT date,timezone FROM activity_events').all()).toEqual([
      { date: '2026-10-30', timezone: 'America/Sao_Paulo' },
    ]);
  });

  it('revokes sessions, removes private data, anonymises references and blocks deleted-account access', async () => {
    // Arrange
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
      .run('session', 9_999_999_999_999, 'secret', 0, 0, 'owner');

    // Act
    const result = await accountsApi(
      request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
      env,
    );

    // Assert
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
    await expect(other?.json()).resolves.toMatchObject({
      profile: { userId: 'other', username: 'OtherPlayer' },
    });
  });

  it('cleans expired personal data while keeping admitted and recently invited members', async () => {
    // Arrange
    const { db, sqlite } = fixture();
    const old = Math.floor((Date.now() - 181 * 86_400_000) / 1000);
    for (const email of ['old@example.com', 'admitted@example.com', 'expired@example.com']) {
      sqlite
        .prepare('INSERT INTO waitlist(email,language,created_at) VALUES (?,?,?)')
        .run(email, 'en-GB', old);
    }
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at,redeemed_by) VALUES (?,?,?)')
      .run('admitted@example.com', 0, 'owner');
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at) VALUES (?,?)')
      .run('expired@example.com', Date.now() - 31 * 86_400_000);

    // Act
    await purgeExpiredPersonalData(db);

    // Assert
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
    // Arrange
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com']) {
      sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');
    }
    const batchId = crypto.randomUUID();

    // Act
    const results = await Promise.all(
      ['first@example.com', 'second@example.com'].map((email) =>
        accountsApi(
          request('/api/operator/invitations/preview', 'POST', { batchId, emails: [email] }),
          env,
        ),
      ),
    );

    // Assert
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM invitation_deliveries').get()).toEqual({
      count: 1,
    });
  });

  it('stops at delivery failure and refuses a blind retry beyond the provider idempotency window', async () => {
    // Arrange
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com']) {
      sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');
    }
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
    const failed = await accountsApi(
      request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
      env,
    );
    const callsAfterFailure = send.mock.calls.length;
    vi.advanceTimersByTime(24 * 3_600_000);

    // Act
    const retried = await accountsApi(
      request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
      env,
    );

    // Assert
    expect(failed?.status).toBe(503);
    expect(callsAfterFailure).toBe(1);
    expect(retried?.status).toBe(409);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare('SELECT sent_at FROM invitation_deliveries').all()).toEqual([
      { sent_at: null },
      { sent_at: null },
    ]);
  });

  it('requires explicit reissue before replacing a still-valid pending invitation', async () => {
    // Arrange
    const { env, sqlite } = fixture();
    sqlite
      .prepare('INSERT INTO waitlist(email,language) VALUES (?,?)')
      .run('beta@example.com', 'en-GB');
    sqlite
      .prepare('INSERT INTO invitations(email,expires_at,delivery_id) VALUES (?,?,?)')
      .run('beta@example.com', Date.now() + 86_400_000, 'old-delivery');
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
    const blocked = await accountsApi(
      request('/api/operator/invitations/send', 'POST', {
        batchId: first,
        capacityConfirmed: true,
      }),
      env,
    );
    const callsBeforeReissue = send.mock.calls.length;
    const reissue = crypto.randomUUID();
    await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId: reissue,
        emails: ['beta@example.com'],
        reissue: true,
      }),
      env,
    );

    // Act
    const sent = await accountsApi(
      request('/api/operator/invitations/send', 'POST', {
        batchId: reissue,
        capacityConfirmed: true,
      }),
      env,
    );

    // Assert
    expect(blocked?.status).toBe(409);
    expect(callsBeforeReissue).toBe(0);
    expect(sent?.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('denies unverified or unlisted operators before accessing the waitlist', async () => {
    // Arrange
    const { env } = fixture();
    authentication.session.mockResolvedValue({ user: { id: 'owner', emailVerified: false } });
    const unverified = await accountsApi(request('/api/operator/waitlist'), env);
    authentication.session.mockResolvedValue({ user: { id: 'other', emailVerified: true } });

    // Act
    const unlisted = await accountsApi(request('/api/operator/waitlist'), env);

    // Assert
    expect(unverified?.status).toBe(403);
    expect(unlisted?.status).toBe(403);
  });

  it('previews and delivers at most ten with stable idempotency keys and safe retries', async () => {
    // Arrange
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
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    const unconfirmed = await accountsApi(
      request('/api/operator/invitations/send', 'POST', { batchId }),
      env,
    );
    const input = request('/api/operator/invitations/send', 'POST', {
      batchId,
      capacityConfirmed: true,
    });
    const delivered = await accountsApi(input, env);
    const retried = await accountsApi(
      request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }),
      env,
    );

    // Act
    const oversized = await accountsApi(
      request('/api/operator/invitations/preview', 'POST', {
        batchId: crypto.randomUUID(),
        emails: Array(11).fill('beta@example.com'),
      }),
      env,
    );

    // Assert
    expect(preview?.status).toBe(200);
    expect(unconfirmed?.status).toBe(400);
    expect(delivered?.status).toBe(200);
    expect(retried?.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      `ludus-invite/${(sqlite.prepare('SELECT id FROM invitation_deliveries').get() as { id: string }).id}`,
    );
    expect(
      sqlite.prepare('SELECT expires_at FROM invitations WHERE email=?').get('beta@example.com'),
    ).toEqual({ expires_at: Date.now() + 7 * 86_400_000 });
    expect(oversized?.status).toBe(400);
  });
});

it('anonymises retained human matches while deleting an account', async () => {
  // Arrange
  const f = fixture();
  f.sqlite
    .prepare(
      "INSERT INTO online_matches(id,white_id,black_id,control,rated) VALUES('human','owner','other','5+3',0)",
    )
    .run();

  // Act
  const response = await accountsApi(
    request('/api/account', 'DELETE', { confirmation: 'DELETE' }),
    f.env,
  );

  // Assert
  expect(response?.status).toBe(200);
  expect(f.anonymise).toHaveBeenCalledWith('owner');
});

describe('public profile SEO privacy and discovery', () => {
  it.each(['email', 'userId', 'timezone', 'teachingProfile', 'trialExpiresAt'])(
    'omits %s from the public profile',
    async (privateKey) => {
      // Arrange
      const { env, db } = fixture();
      await accountsApi(
        request('/api/account', 'POST', { ...profile, activityPublic: false }),
        env,
      );
      await recordActivity(db, {
        gameId: 'private-game',
        players: ['owner'],
        reason: 'checkmate',
        moves: 20,
        completedAt: Date.now(),
      });

      // Act
      const data = await readPublicProfile(db, profile.username);

      // Assert
      expect(data).not.toHaveProperty(privateKey);
    },
  );

  it('shares the API privacy boundary and removes deletion-pending profiles from discovery', async () => {
    // Arrange
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
    const listed = await (await profileSitemap(db, '/sitemaps/profiles-1.xml')).text();
    sqlite.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
    const removed = await readPublicProfile(db, profile.username);
    const index = await (await profileSitemap(db, '/sitemap.xml')).text();

    // Act
    const missing = await profileSitemap(db, '/sitemaps/profiles-1.xml');

    // Assert
    expect(data).toMatchObject({ username: profile.username, activityPublic: false });
    expect(data).not.toHaveProperty('activity');
    expect(listed).toContain('/@ownerplayer');
    expect(removed).toBeNull();
    expect(index).not.toContain('/sitemaps/profiles-1.xml');
    expect(missing.status).toBe(404);
  });

  it('paginates discovery beyond one thousand players without repeating entries', async () => {
    // Arrange
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
    const first = await (await profileSitemap(db, '/sitemaps/profiles-1.xml')).text();
    const second = await (await profileSitemap(db, '/sitemaps/profiles-2.xml')).text();

    // Act
    const overflow = await profileSitemap(db, '/sitemaps/profiles-9007199254740992.xml');

    // Assert
    expect(index).toContain('profiles-2.xml');
    expect(index).not.toContain('profiles-3.xml');
    expect(first.match(/<url>/g)).toHaveLength(1000);
    expect(second.match(/<url>/g)).toHaveLength(1);
    expect(first).not.toContain('/@player1000');
    expect(second).toContain('/@player1000');
    expect(overflow.status).toBe(404);
  });

  it('returns a retryable 503 when the HTML template is unavailable', async () => {
    // Arrange
    const { env } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    env.ASSETS = {
      fetch: async () => new Response(null, { status: 503 }),
      connect: () => {
        throw new Error('unused');
      },
    };

    // Act
    const response = await publicProfileSeo(request('/@ownerplayer'), env);

    // Assert
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serialises public bootstrap JSON without allowing an injected closing script tag', () => {
    // Arrange
    const profileData = {
      username: '</script><script>alert(1)</script>',
      data: null,
      missing: true,
    };

    // Act
    const text = serialisePublicProfile(profileData);

    // Assert
    expect(text).not.toContain('<');
    expect(JSON.parse(text).username).toBe('</script><script>alert(1)</script>');
  });
});
