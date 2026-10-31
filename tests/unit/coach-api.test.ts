import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../worker/auth', () => ({ authFor: () => ({ api: { getSession: async () => null } }) }));
import { coachApi, type CoachAccount, type CoachDependencies } from '../../worker/coach';
import { CoachStore, deleteCoachAccount } from '../../worker/coach-store';
import type { CoachEnvironment } from '../../worker/coach-provider';
import type { SavedCoachMatch } from '../../shared/coaching';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0000_grey_triton.sql', '0001_pale_microchip.sql', '0003_accounts.sql', '0005_coach.sql']) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  for (const id of ['owner', 'other']) {
    sqlite.prepare('INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, id, `${id}@example.com`, 1, 0, 0);
    sqlite.prepare("INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES (?,?,'en-GB','Europe/Madrid','casual','beginner',0,'v1',0,0)").run(id, id);
  }
  function statement(query: string, parameters: unknown[] = []) {
    const bindings = parameters as (string | number | null)[];
    const execute = () => ({ meta: { changes: Number(sqlite.prepare(query).run(...bindings).changes) } });
    return { bind: (...values: unknown[]) => statement(query, values), first: async () => sqlite.prepare(query).get(...bindings) ?? null, all: async () => ({ results: sqlite.prepare(query).all(...bindings) }), run: async () => execute(), execute };
  }
  const db = { prepare: (query: string) => statement(query), batch: async (queries: ReturnType<typeof statement>[]) => {
    sqlite.exec('BEGIN'); try { const result = queries.map((query) => query.execute()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  let now = Date.parse('2026-10-30T12:00:00Z');
  let owner = 'owner'; let expires: number | null = null; let profile = 'beginner' as const;
  const match: SavedCoachMatch = { id: 'match-1', moves: ['e4', 'e5', 'Nf3'], result: { reason: 'resignation' }, colour: 'w' };
  const generated = { summary: 'Develop your pieces.', variations: [{ ply: 0, moves: ['e2e4'], explanation: 'Occupy the centre.' }], mistakes: [] };
  const generate = vi.fn().mockResolvedValue({ document: generated, costMicros: 100 });
  const dependencies: CoachDependencies = { session: async () => owner ? { id: owner } : null, account: async () => ({ trialExpiresAt: expires, teachingProfile: profile }), loadMatch: async (id, game) => id === 'owner' && game === match.id ? match : null, available: async () => true, generate, now: () => now };
  const env = { DB: db, MATCHES: {}, COACH_MODEL: 'test-model', COACH_INPUT_USD_PER_MILLION: '.5', COACH_OUTPUT_USD_PER_MILLION: '.5' } as unknown as CoachEnvironment;
  return { sqlite, db, env, dependencies, match, generated, generate, setOwner: (value: string) => { owner = value; }, setNow: (value: number) => { now = value; }, setTrial: (value: number | null) => { expires = value; } };
}
const input = (key = 'idempotency-key-0001') => ({ key, matchId: 'match-1', language: 'en-GB', profile: 'beginner', analysis: [{ ply: 0, cp: 20, mate: null, depth: 12, moves: ['e2e4'] }] });
function request(path = '/api/coach/reviews', body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  return new Request(`https://ludus.example${path}`, { method, headers: { Origin: 'https://ludus.example', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function review(f: ReturnType<typeof fixture>, key = 'idempotency-key-0001') {
  const response = await coachApi(request(undefined, input(key)), f.env, f.dependencies);
  expect(response.status).toBe(200); return (await response.json() as { review: { id: string; language: string; profile: string } }).review;
}
describe('private coach API with atomic SQLite accounting', () => {
  it('uses trusted paid access after beta and removes it at expiry without resetting usage', async () => {
    const f = fixture();
    const expiry = Date.parse('2026-11-01T00:00:00Z');
    const account: CoachAccount = { trialExpiresAt: 0, paidAccessUntil: expiry, teachingProfile: 'beginner' };
    f.dependencies.account = async () => account;
    await review(f);
    const status = async () => (await coachApi(request('/api/coach/status'), f.env, f.dependencies)).json() as Promise<{ plus: boolean; limit: number; usage: { reviews: number } }>;
    expect(await status()).toMatchObject({ plus: true, limit: 30, usage: { reviews: 1 } });
    account.paidAccessSuspended = true;
    expect(await status()).toMatchObject({ plus: false, limit: 3, usage: { reviews: 1 } });
    account.paidAccessSuspended = false;
    account.paidAccessUntil = Date.parse('2026-10-30T12:00:00Z');
    expect(await status()).toMatchObject({ plus: false, limit: 3, usage: { reviews: 1 } });
  });

  it('saves idempotently and preserves language when the UI changes', async () => {
    const f = fixture(); const saved = await review(f); await review(f);
    expect(f.generate).toHaveBeenCalledOnce();
    expect((await new CoachStore(f.db).usage('owner', Date.parse('2026-10-30'))).reviews).toBe(1);
    const read = await coachApi(request(`/api/coach/reviews/${saved.id}`), f.env, f.dependencies);
    expect((await read.json() as { review: { language: string } }).review.language).toBe('en-GB');
    const conflict = await coachApi(request(undefined, { ...input(), language: 'fr-FR' }), f.env, f.dependencies);
    expect(conflict.status).toBe(409);
  });
  it('prevents cross-account reads, generation, replies and deletion', async () => {
    const f = fixture(); const saved = await review(f); f.setOwner('other');
    for (const method of ['GET', 'DELETE']) expect((await coachApi(request(`/api/coach/reviews/${saved.id}`, undefined, method), f.env, f.dependencies)).status).toBe(404);
    expect((await coachApi(request(undefined, input('different-key-0001')), f.env, f.dependencies)).status).toBe(404);
    expect((await coachApi(request(`/api/coach/reviews/${saved.id}/replies`, { key: 'different-key-0002', question: 'Why?', language: 'en-GB' }), f.env, f.dependencies)).status).toBe(404);
    f.setOwner(''); expect((await coachApi(request('/api/coach/status'), f.env, f.dependencies)).status).toBe(401);
  });
  it('rejects live matches and malicious analysis before reserving or calling a provider', async () => {
    const f = fixture(); f.match.result = null;
    expect((await coachApi(request(undefined, input()), f.env, f.dependencies)).status).toBe(409);
    f.match.result = { reason: 'resignation' };
    expect((await coachApi(request(undefined, { ...input(), analysis: [{ ...input().analysis[0], moves: ['e2e5'] }] }), f.env, f.dependencies)).status).toBe(400);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.sqlite.prepare('SELECT COUNT(*) AS count FROM coach_requests').get()?.count).toBe(0);
  });
  it('reserves concurrent requests once and prevents concurrent quota overspend', async () => {
    const f = fixture(); let resolve!: (value: unknown) => void;
    f.generate.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = coachApi(request(undefined, input()), f.env, f.dependencies);
    await vi.waitFor(() => expect(f.generate).toHaveBeenCalledOnce());
    expect((await coachApi(request(undefined, input()), f.env, f.dependencies)).status).toBe(409);
    resolve({ document: f.generated, costMicros: 100 }); expect((await first).status).toBe(200);
    f.generate.mockResolvedValue({ document: f.generated, costMicros: 100 });
    const attempts = await Promise.all([2, 3, 4].map((i) => coachApi(request(undefined, input(`idempotency-key-000${i}`)), f.env, f.dependencies)));
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 200, 429]);
    expect(f.generate).toHaveBeenCalledTimes(3);
  });
  it('failed generations consume no review allowance, retain cost and allow same-key retry', async () => {
    const f = fixture(); f.generate.mockRejectedValueOnce(new Error('provider outage'));
    expect((await coachApi(request(undefined, input()), f.env, f.dependencies)).status).toBe(503);
    expect((await new CoachStore(f.db).usage('owner', Date.parse('2026-10-30'))).reviews).toBe(0);
    expect(Number(f.sqlite.prepare('SELECT spent_micros FROM coach_requests').get()?.spent_micros)).toBeGreaterThan(0);
    await review(f); expect(f.generate).toHaveBeenCalledTimes(2);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS count FROM coach_requests').get()?.count).toBe(2);
  });
  it('invalid generated variations are never saved or charged to player quota', async () => {
    const f = fixture(); f.generate.mockResolvedValueOnce({ document: { ...f.generated, variations: [{ ply: 0, moves: ['e2e5'], explanation: 'Illegal.' }] }, costMicros: 100 });
    expect((await coachApi(request(undefined, input()), f.env, f.dependencies)).status).toBe(503);
    expect((await new CoachStore(f.db).reviews('owner'))).toEqual([]);
    expect((await new CoachStore(f.db).usage('owner', Date.parse('2026-10-30'))).reviews).toBe(0);
  });
  it('applies free limits immediately at exact trial expiry without deleting saved reviews', async () => {
    const f = fixture(); const now = Date.parse('2026-10-30T12:00:00Z'); f.setTrial(now + 1000);
    for (let i = 0; i < 4; i++) await review(f, `idempotency-trial-${i}`);
    f.setNow(now + 1000);
    expect((await coachApi(request(undefined, input('idempotency-trial-5')), f.env, f.dependencies)).status).toBe(429);
    const status = await coachApi(request('/api/coach/status'), f.env, f.dependencies);
    expect(await status.json()).toMatchObject({ plus: false, limit: 3, usage: { reviews: 4 } });
    expect(await new CoachStore(f.db).reviews('owner')).toHaveLength(4);
    f.setNow(Date.parse('2026-11-01T00:00:00Z')); await review(f, 'idempotency-month-1');
  });
  it('preserves saved conversations after downgrade while blocking new replies', async () => {
    const f = fixture(); f.setTrial(Date.parse('2026-11-01')); const saved = await review(f);
    const replyBody = { key: 'conversation-key-0001', question: 'Why develop?', language: 'fr-FR' };
    expect((await coachApi(request(`/api/coach/reviews/${saved.id}/replies`, replyBody), f.env, f.dependencies)).status).toBe(200);
    f.setTrial(null);
    expect((await coachApi(request(`/api/coach/reviews/${saved.id}/replies`, { ...replyBody, key: 'conversation-key-0002' }), f.env, f.dependencies)).status).toBe(403);
    const savedRead = await coachApi(request(`/api/coach/reviews/${saved.id}`), f.env, f.dependencies);
    expect((await savedRead.json() as { replies: { language: string }[] }).replies).toMatchObject([{ language: 'fr-FR' }]);
  });
  it('enforces per-review and monthly conversation limits inside the atomic reservation', async () => {
    const f = fixture(); const store = new CoachStore(f.db), now = Date.parse('2026-10-30');
    for (let i = 0; i < 200; i++) {
      const id = `reply-${i}`;
      expect(await store.reserve({ id, owner: 'owner', key: id, fingerprint: id, kind: 'reply', reviewId: `review-${Math.floor(i / 20)}`, now, limit: 200, reserveMicros: 100 })).toBe(true);
      await f.db.prepare("UPDATE coach_requests SET state='complete',spent_micros=100 WHERE id=?").bind(id).run();
    }
    expect(await store.reserve({ id: 'extra-review', owner: 'owner', key: 'extra-review', fingerprint: 'x', kind: 'reply', reviewId: 'review-0', now, limit: 1000, reserveMicros: 100 })).toBe(false);
    expect(await store.reserve({ id: 'extra-month', owner: 'owner', key: 'extra-month', fingerprint: 'x', kind: 'reply', reviewId: 'review-new', now, limit: 200, reserveMicros: 100 })).toBe(false);
  });
  it('fails closed when the model is unavailable and still reads saved reviews', async () => {
    const f = fixture(); const saved = await review(f); f.dependencies.available = async () => false;
    expect((await coachApi(request(undefined, input('idempotency-outage-1')), f.env, f.dependencies)).status).toBe(503);
    expect((await coachApi(request(`/api/coach/reviews/${saved.id}`), f.env, f.dependencies)).status).toBe(200);
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it('preserves global spending across account deletion and invalidates in-flight saves', async () => {
    const f = fixture(); const store = new CoachStore(f.db), now = Date.parse('2026-10-30');
    expect(await store.reserve({ id: 'cost', owner: 'owner', key: 'cost', fingerprint: 'cost', kind: 'review', reviewId: null, now, limit: 30, reserveMicros: 20_000_000 })).toBe(true);
    await deleteCoachAccount(f.db, 'owner');
    expect(await store.finishReview('cost', 'owner', 'match-1', 'en-GB', 'beginner', f.generated, input().analysis, now + 1, 100)).toBe(false);
    expect(await store.reserve({ id: 'next', owner: 'other', key: 'next', fingerprint: 'next', kind: 'review', reviewId: null, now, limit: 30, reserveMicros: 1 })).toBe(false);
    expect((await store.reviews('owner'))).toEqual([]);
  });
  it('expires abandoned reservations without player quota consumption or budget leakage', async () => {
    const f = fixture(); const store = new CoachStore(f.db), now = Date.parse('2026-10-30');
    await store.reserve({ id: 'stale', owner: 'owner', key: 'stale', fingerprint: 'stale', kind: 'review', reviewId: null, now, limit: 3, reserveMicros: 500 });
    await store.expire(now + 90_000);
    expect(await store.usage('owner', now)).toEqual({ reviews: 0, replies: 0 });
    expect(f.sqlite.prepare('SELECT state,spent_micros FROM coach_requests').get()).toMatchObject({ state: 'failed', spent_micros: 500 });
  });
  it('fences stale account snapshots at reservation and at provider completion', async () => {
    const f = fixture(); let resolve!: (value: unknown) => void;
    f.generate.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = coachApi(request(undefined, input()), f.env, f.dependencies);
    await vi.waitFor(() => expect(f.generate).toHaveBeenCalledOnce());
    // Deletion first revokes sessions with a persistent tombstone; private cleanup may still be running.
    f.sqlite.prepare('INSERT INTO account_deletions(user_id,requested_at) VALUES (?,?)').run('owner', Date.parse('2026-10-30'));
    resolve({ document: f.generated, costMicros: 100 });
    expect((await pending).status).toBe(503);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS count FROM coach_reviews').get()?.count).toBe(0);
    expect(f.sqlite.prepare('SELECT state,spent_micros FROM coach_requests').get()).toMatchObject({ state: 'failed', spent_micros: 100 });
    // Dependencies deliberately return the stale profile/session snapshot. SQL must still deny generation.
    expect((await coachApi(request(undefined, input('idempotency-after-delete')), f.env, f.dependencies)).status).toBe(429);
    expect(f.generate).toHaveBeenCalledOnce();
    f.sqlite.prepare('DELETE FROM account_deletions').run();
    f.sqlite.prepare('DELETE FROM player_profiles WHERE user_id=?').run('owner');
    expect((await coachApi(request(undefined, input('idempotency-after-profile')), f.env, f.dependencies)).status).toBe(429);
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it('rejects cross-origin mutations', async () => {
    const f = fixture(); const forged = new Request('https://ludus.example/api/coach/reviews', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
    expect((await coachApi(forged, f.env, f.dependencies)).status).toBe(403); expect(f.generate).not.toHaveBeenCalled();
  });
});
