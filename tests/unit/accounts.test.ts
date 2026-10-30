import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const authentication = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../../worker/auth', () => ({ authFor: () => ({ api: { getSession: authentication.session } }) }));
import { accountsApi, loadPlayerProfile, purgeExpiredPersonalData, recordActivity } from '../../worker/accounts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0000_grey_triton.sql', '0001_pale_microchip.sql', '0003_accounts.sql', '0004_online.sql', '0005_coach.sql', '0006_cosmetics.sql', '0007_invitation_batches.sql']) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  sqlite.prepare('INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('owner', 'Owner', 'owner@example.com', 1, 0, 0);
  sqlite.prepare('INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('other', 'Other', 'other@example.com', 1, 0, 0);
  function statement(query: string, parameters: unknown[] = []) {
    const bindings = parameters as (string | number | null)[];
    return {
      bind: (...values: unknown[]) => statement(query, values),
      first: async () => sqlite.prepare(query).get(...bindings) ?? null,
      all: async () => ({ results: sqlite.prepare(query).all(...bindings) }),
      run: () => ({ meta: { changes: sqlite.prepare(query).run(...bindings).changes } }),
    };
  }
  const db = { prepare: (query: string) => statement(query), batch: async (queries: ReturnType<typeof statement>[]) => {
    sqlite.exec('BEGIN'); try { const results = []; for (const query of queries) results.push(query.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  const anonymise = vi.fn().mockResolvedValue(undefined), removeUser = vi.fn().mockResolvedValue(undefined);
  return { sqlite, db, anonymise, removeUser, env: { DB: db, OPERATOR_IDS: 'owner', RESEND_API_KEY: 'test', AUTH_EMAIL_FROM: 'invites@example.com', MATCHES: { getByName: () => ({ anonymise }) }, MATCHMAKING: { getByName: () => ({ removeUser }) } } as unknown as Env };
}
const profile = { username: 'OwnerPlayer', language: 'en-GB', timezone: 'Europe/Madrid', chessLevel: 'casual', teachingProfile: 'developing', adult: true, activityPublic: true };
function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`https://ludus.example${path}`, { method, headers: { Origin: 'https://ludus.example', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => { authentication.session.mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com', emailVerified: true } }); vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-10-30T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('account lifecycle with real SQLite migrations', () => {
  it('serialises conflicting onboarding attempts without changing the winning timezone or trial', async () => {
    const { env, sqlite } = fixture();
    const results = await Promise.all([
      accountsApi(request('/api/account', 'POST', profile), env),
      accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'Asia/Tokyo' }), env),
    ]);
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT timezone FROM player_profiles').all()).toEqual(sqlite.prepare('SELECT timezone FROM timezone_history').all());
  });
  it('starts the card-free trial once and never renews it on profile updates', async () => {
    const { env, db } = fixture();
    expect((await accountsApi(request('/api/account', 'POST', profile), env))?.status).toBe(200);
    const first = await loadPlayerProfile(db, 'owner');
    expect(first?.trialExpiresAt).toBe(Date.now() + 30 * 86400000);
    vi.advanceTimersByTime(86400000);
    expect((await accountsApi(request('/api/account', 'POST', { ...profile, teachingProfile: 'club' }), env))?.status).toBe(200);
    const updated = await loadPlayerProfile(db, 'owner');
    expect(updated?.trialExpiresAt).toBe(first?.trialExpiresAt);
    expect(updated?.adultAttestedAt).toBe(first?.adultAttestedAt);
    expect(updated?.teachingProfile).toBe('club');
  });

  it('protects case-insensitive usernames and validates adult attestation', async () => {
    const { env } = fixture();
    expect((await accountsApi(request('/api/account', 'POST', { ...profile, adult: false }), env))?.status).toBe(400);
    await accountsApi(request('/api/account', 'POST', profile), env);
    authentication.session.mockResolvedValue({ user: { id: 'other', email: 'other@example.com', emailVerified: true } });
    expect((await accountsApi(request('/api/account', 'POST', { ...profile, username: 'ownerplayer' }), env))?.status).toBe(409);
  });

  it('hides private activity at the public API boundary without leaking private profile fields', async () => {
    const { env, db } = fixture();
    await accountsApi(request('/api/account', 'POST', { ...profile, activityPublic: false }), env);
    await recordActivity(db, { gameId: 'mate', players: ['owner'], reason: 'checkmate', moves: 4, completedAt: Date.now() });
    authentication.session.mockResolvedValue(null);
    const result = await accountsApi(request('/api/profiles/OwnerPlayer'), env);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({ username: 'OwnerPlayer', activityPublic: false, ratings: [] });
  });

  it('attributes activity once using historical timezone despite later changes', async () => {
    const { env, db, sqlite } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    const completedAt = Date.parse('2026-10-30T23:30:00Z');
    await accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'America/Sao_Paulo' }), env);
    vi.setSystemTime(Date.parse('2026-10-31T12:00:00Z'));
    await accountsApi(request('/api/account', 'POST', { ...profile, timezone: 'Asia/Tokyo' }), env);
    const input = { gameId: 'game', players: ['owner', 'owner'], reason: 'timeout', moves: 10, completedAt };
    await recordActivity(db, input); await recordActivity(db, input);
    expect(sqlite.prepare('SELECT date,timezone FROM activity_events').all()).toEqual([{ date: '2026-10-30', timezone: 'America/Sao_Paulo' }]);
  });

  it('revokes sessions, removes private data, anonymises references and blocks deleted-account access', async () => {
    const { env, sqlite, anonymise, removeUser } = fixture();
    await accountsApi(request('/api/account', 'POST', profile), env);
    authentication.session.mockResolvedValue({ user: { id: 'other', email: 'other@example.com', emailVerified: true } });
    await accountsApi(request('/api/account', 'POST', { ...profile, username: 'OtherPlayer' }), env);
    authentication.session.mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com', emailVerified: true } });
    sqlite.prepare('INSERT INTO matches(id,owner,created_at) VALUES (?,?,?)').run('game', 'owner', 0);
    sqlite.prepare('INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)').run('session', 9999999999999, 'secret', 0, 0, 'owner');
    const result = await accountsApi(request('/api/account', 'DELETE', { confirmation: 'DELETE' }), env);
    expect(result?.status).toBe(200);
    expect(sqlite.prepare('SELECT * FROM session').all()).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM player_profiles WHERE user_id=?').all('owner')).toEqual([]);
    expect(sqlite.prepare('SELECT name,email FROM user WHERE id=?').get('owner')).toEqual({ name: 'Deleted player', email: 'owner@deleted.invalid' });
    expect(anonymise).toHaveBeenCalledWith('owner'); expect(removeUser).toHaveBeenCalledWith('owner');
    expect((await accountsApi(request('/api/account'), env))?.status).toBe(403);
    authentication.session.mockResolvedValue({ user: { id: 'other', email: 'other@example.com', emailVerified: true } });
    expect((await accountsApi(request('/api/profiles/OwnerPlayer'), env))?.status).toBe(404);
    const other = await accountsApi(request('/api/account'), env);
    expect(await other?.json()).toMatchObject({ profile: { userId: 'other', username: 'OtherPlayer' } });
  });
  it('cleans expired personal data while keeping admitted and recently invited members', async () => {
    const { db, sqlite } = fixture();
    const old = Math.floor((Date.now() - 181 * 86400000) / 1000);
    for (const email of ['old@example.com', 'admitted@example.com', 'expired@example.com']) sqlite.prepare('INSERT INTO waitlist(email,language,created_at) VALUES (?,?,?)').run(email, 'en-GB', old);
    sqlite.prepare('INSERT INTO invitations(email,expires_at,redeemed_by) VALUES (?,?,?)').run('admitted@example.com', 0, 'owner');
    sqlite.prepare('INSERT INTO invitations(email,expires_at) VALUES (?,?)').run('expired@example.com', Date.now() - 31 * 86400000);
    await purgeExpiredPersonalData(db);
    expect(sqlite.prepare('SELECT email FROM waitlist').all()).toEqual([{ email: 'admitted@example.com' }]);
    expect(sqlite.prepare('SELECT email FROM invitations').all()).toEqual([{ email: 'admitted@example.com' }]);
  });
});

describe('operator invitation batches', () => {
  it('does not merge different recipient lists racing for one batch ID', async () => {
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com']) sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');
    const batchId = crypto.randomUUID();
    const results = await Promise.all(['first@example.com', 'second@example.com'].map((email) => accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId, emails: [email] }), env)));
    expect(results.map((result) => result?.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM invitation_deliveries').get()).toEqual({ count: 1 });
  });
  it('stops at delivery failure and refuses a blind retry beyond the provider idempotency window', async () => {
    const { env, sqlite } = fixture();
    for (const email of ['first@example.com', 'second@example.com']) sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run(email, 'en-GB');
    const batchId = crypto.randomUUID();
    await accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId, emails: ['first@example.com', 'second@example.com'] }), env);
    const send = vi.fn().mockRejectedValue(new Error('provider timeout')); vi.stubGlobal('fetch', send);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }), env))?.status).toBe(503);
    expect(send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(24 * 3600000);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }), env))?.status).toBe(409);
    expect(send).toHaveBeenCalledOnce();
    expect(sqlite.prepare('SELECT sent_at FROM invitation_deliveries').all()).toEqual([{ sent_at: null }, { sent_at: null }]);
  });
  it('requires explicit reissue before replacing a still-valid pending invitation', async () => {
    const { env, sqlite } = fixture();
    sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run('beta@example.com', 'en-GB');
    sqlite.prepare('INSERT INTO invitations(email,expires_at,delivery_id) VALUES (?,?,?)').run('beta@example.com', Date.now() + 86400000, 'old-delivery');
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', send);
    const first = crypto.randomUUID();
    await accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId: first, emails: ['beta@example.com'] }), env);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId: first, capacityConfirmed: true }), env))?.status).toBe(409);
    expect(send).not.toHaveBeenCalled();
    const reissue = crypto.randomUUID();
    await accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId: reissue, emails: ['beta@example.com'], reissue: true }), env);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId: reissue, capacityConfirmed: true }), env))?.status).toBe(200);
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
    sqlite.prepare('INSERT INTO waitlist(email,language) VALUES (?,?)').run('beta@example.com', 'fr-FR');
    const batchId = '12345678-1234-1234-1234-123456789abc';
    const preview = await accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId, emails: ['beta@example.com'] }), env);
    expect(preview?.status).toBe(200);
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', send);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId }), env))?.status).toBe(400);
    const input = request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true });
    expect((await accountsApi(input, env))?.status).toBe(200);
    expect((await accountsApi(request('/api/operator/invitations/send', 'POST', { batchId, capacityConfirmed: true }), env))?.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(`ludus-invite/${(sqlite.prepare('SELECT id FROM invitation_deliveries').get() as { id: string }).id}`);
    expect(sqlite.prepare('SELECT expires_at FROM invitations WHERE email=?').get('beta@example.com')).toEqual({ expires_at: Date.now() + 7 * 86400000 });
    expect((await accountsApi(request('/api/operator/invitations/preview', 'POST', { batchId: crypto.randomUUID(), emails: Array(11).fill('beta@example.com') }), env))?.status).toBe(400);
  });
});
