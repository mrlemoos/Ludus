import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: DurableObjectState, public env: Env) {} } }));
vi.mock('../../worker/accounts', () => ({ recordActivity: vi.fn() }));
import { recordActivity } from '../../worker/accounts';
import { Matchmaking } from '../../worker/matchmaking';
import { onlineApi } from '../../worker/online-api';
import { HumanMatch } from '../../worker/human-match';
import { createHumanGame, humanConnection, type HumanGame } from '../../shared/human-game';
import type { Assignment } from '../../shared/matchmaking';
function sqliteContext() {
  const db = new DatabaseSync(':memory:');
  const storage = { sql: { exec(query: string, ...bindings: SQLInputValue[]) { if (!bindings.length && query.startsWith('CREATE')) { db.exec(query); return { toArray: () => [] }; } const rows = db.prepare(query).all(...bindings); return { toArray: () => rows }; } }, setAlarm: vi.fn().mockResolvedValue(undefined), deleteAlarm: vi.fn().mockResolvedValue(undefined) };
  const sockets: { player: string; readyState: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; deserializeAttachment: () => { player: string } }[] = [];
  return { db, storage, sockets, ctx: { storage, getWebSockets: (tag?: string) => sockets.filter((socket) => !tag || socket.player === tag), acceptWebSocket: vi.fn() } as unknown as DurableObjectState };
}
function d1Database() {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync('drizzle/0004_online.sql', 'utf8')); db.exec('CREATE TABLE account_deletions(user_id TEXT PRIMARY KEY)');
  const prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const statement = { bind(...params: SQLInputValue[]) { values = params; return statement; }, async run() { return db.prepare(query).run(...values); }, async all() { return { results: db.prepare(query).all(...values) }; }, async first() { return db.prepare(query).get(...values) ?? null; }, execute() { return db.prepare(query).run(...values); } };
    return statement;
  };
  const batch = vi.fn(async (statements: ReturnType<typeof prepare>[]) => { db.exec('BEGIN'); try { const results = statements.map((statement) => statement.execute()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } });
  return { db, batch, binding: { prepare, batch } as unknown as D1Database };
}
function coordinator() { const local = sqliteContext(), initialise = vi.fn().mockResolvedValue(undefined), env = { HUMAN_MATCHES: { getByName: () => ({ initialise }) } } as unknown as Env; return { ...local, initialise, coordinator: new Matchmaking(local.ctx, env) }; }
const assignment: Assignment = { id: 'game', players: { w: 'white', b: 'black' }, control: '5+3', rated: false, createdAt: 0 };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());
describe('SQLite matchmaking assignment races', () => {
  it('reserves both users before awaiting match initialisation; cancellation cannot steal an assignment', async () => {
    const f = coordinator(); const first = await f.coordinator.join('white', '5+3', false, 1500);
    expect(first.status).toBe('queued'); if (first.status !== 'queued') throw new Error('queued');
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); f.initialise.mockImplementation(() => held);
    const matching = f.coordinator.join('black', '5+3', false, 1500);
    const cancellation = f.coordinator.cancel('white', first.entry.token);
    release();
    const [matched, cancelled] = await Promise.all([matching, cancellation]);
    expect(matched.status).toBe('assigned'); expect(cancelled.status).toBe('assigned');
    if (matched.status !== 'assigned' || cancelled.status !== 'assigned') throw new Error('assigned');
    expect(cancelled.match.id).toBe(matched.match.id);
    expect(matched.match.players).toEqual({ w: 'white', b: 'black' });
    expect((await f.coordinator.join('white', '10+5', false, 1500))).toMatchObject({ status: 'assigned', match: { id: matched.match.id } });
  });
  it('cancels before assignment and requires explicit delayed AI acceptance with exact token', async () => {
    const f = coordinator(), queued = await f.coordinator.join('one', '5+3', false, 1500); if (queued.status !== 'queued') throw new Error('queued');
    await expect(f.coordinator.cancel('one', queued.entry.token, true)).rejects.toThrow('too_early');
    vi.setSystemTime(31000); await expect(f.coordinator.cancel('one', 'stale', true)).rejects.toThrow('stale_queue');
    expect(await f.coordinator.cancel('one', queued.entry.token, true)).toEqual({ status: 'idle', aiAccepted: true });
    const other = await f.coordinator.join('two', '5+3', false, 1500); expect(other.status).toBe('queued'); expect(f.initialise).not.toHaveBeenCalled();
  });
  it('reserves computer matches atomically against queue, invitation and redemption', async () => {
    const f = coordinator();
    await f.coordinator.reserveComputer('one', 'computer');
    await expect(f.coordinator.reserveComputer('one', 'computer')).resolves.toEqual({ reserved: true });
    await expect(f.coordinator.join('one', '5+3', false, 1500)).rejects.toThrow('computer_active');
    await expect(f.coordinator.createInvite('one', '5+3')).rejects.toThrow('busy');
    const invite = await f.coordinator.createInvite('friend', '5+3');
    await expect(f.coordinator.redeem('one', invite.token, 'b')).rejects.toThrow('busy');
    await f.coordinator.releaseComputer('one', 'stale');
    expect(await f.coordinator.status('one')).toEqual({ status: 'computer', id: 'computer' });
    await f.coordinator.releaseComputer('one', 'computer');
    const queued = await f.coordinator.join('one', '5+3', false, 1500);
    await expect(f.coordinator.reserveComputer('one', 'another')).rejects.toThrow('busy');
    expect(queued.status).toBe('queued');
  });
  it('issues a new link when the saved invitation is gone', async () => {
    const f = coordinator(), invite = await f.coordinator.createInvite('owner', '5+3');
    f.db.prepare('DELETE FROM invites WHERE token=?').run(invite.token);
    expect(await f.coordinator.status('owner')).toEqual({ status: 'idle' });
    const next = await f.coordinator.createInvite('owner', '5+3');
    expect(next.token).not.toBe(invite.token);
    const joined = await f.coordinator.redeem('friend', next.token, 'b');
    expect(joined.match.players).toEqual({ w: 'owner', b: 'friend' });
  });
  it('redeems invitations only once and keeps the first seats when the guest retries another colour', async () => {
    const f = coordinator(), invite = await f.coordinator.createInvite('owner', '10+5');
    expect(invite.expiresAt).toBe(86401000);
    await expect(f.coordinator.redeem('owner', invite.token, 'random')).rejects.toThrow('invalid_invite');
    const first = await f.coordinator.redeem('friend', invite.token, 'w'), retry = await f.coordinator.redeem('friend', invite.token, 'b');
    expect(first).toEqual(retry); expect(first.match.rated).toBe(false);
    expect(first.match.players).toEqual({ w: 'friend', b: 'owner' });
    expect(retry.match.id).toBe(first.match.id); expect(retry.match.players).toEqual(first.match.players);
    expect(Object.values(first.match.players).sort()).toEqual(['friend', 'owner']);
    await expect(f.coordinator.redeem('other', invite.token, 'w')).rejects.toThrow('redeemed');
    await f.coordinator.release(first.match.id, ['owner', 'friend']);
    expect(await f.coordinator.status('owner')).toEqual({ status: 'idle' });
  });
  it('seats the guest on the requested side and keeps friend matches casual', async () => {
    const original = crypto.getRandomValues.bind(crypto);
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array && array.length === 1) array[0] = 255; else return original(array);
      return array;
    });
    try {
      const white = coordinator(), whiteInvite = await white.coordinator.createInvite('host', '5+3');
      const asWhite = await white.coordinator.redeem('guest', whiteInvite.token, 'w');
      expect(asWhite.match.players).toEqual({ w: 'guest', b: 'host' }); expect(asWhite.match.rated).toBe(false);
      spy.mockImplementation((array) => { if (array instanceof Uint8Array && array.length === 1) array[0] = 0; else return original(array); return array; });
      const black = coordinator(), blackInvite = await black.coordinator.createInvite('host', '10+5');
      const asBlack = await black.coordinator.redeem('guest', blackInvite.token, 'b');
      expect(asBlack.match.players).toEqual({ w: 'host', b: 'guest' }); expect(asBlack.match.rated).toBe(false);
    } finally { spy.mockRestore(); }
  });
  it('rolls random guest colour once on the server and ignores a later colour', async () => {
    const original = crypto.getRandomValues.bind(crypto);
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array && array.length === 1) array[0] = 127; else return original(array);
      return array;
    });
    const rolls = () => spy.mock.calls.filter((call) => call[0] instanceof Uint8Array && call[0].length === 1).length;
    try {
      const low = coordinator(), lowInvite = await low.coordinator.createInvite('host', '5+3');
      const lowMatch = await low.coordinator.redeem('guest', lowInvite.token, 'random');
      expect(lowMatch.match.players).toEqual({ w: 'guest', b: 'host' }); expect(rolls()).toBe(1);
      const retry = await low.coordinator.redeem('guest', lowInvite.token, 'b');
      expect(retry.match.id).toBe(lowMatch.match.id); expect(retry.match.players).toEqual(lowMatch.match.players); expect(rolls()).toBe(1);
      spy.mockImplementation((array) => { if (array instanceof Uint8Array && array.length === 1) array[0] = 128; else return original(array); return array; });
      const high = coordinator(), highInvite = await high.coordinator.createInvite('host', '10+5');
      const highMatch = await high.coordinator.redeem('guest', highInvite.token, 'random');
      expect(highMatch.match.players).toEqual({ w: 'host', b: 'guest' }); expect(highMatch.match.rated).toBe(false); expect(rolls()).toBe(2);
    } finally { spy.mockRestore(); }
  });
  it('pushes one assigned match to both players after initialisation', async () => {
    const f = coordinator();
    const socket = (player: string) => ({ player, readyState: 1, send: vi.fn(), close: vi.fn(), deserializeAttachment: () => ({ player }) });
    const waiting = socket('white'), joining = socket('black');
    f.sockets.push(waiting, joining);
    const order: string[] = [];
    f.initialise.mockImplementation(async () => { order.push('ensure'); });
    waiting.send.mockImplementation((payload: string) => { if (JSON.parse(payload).status === 'assigned') order.push('waiting'); });
    joining.send.mockImplementation((payload: string) => { if (JSON.parse(payload).status === 'assigned') order.push('joining'); });
    expect((await f.coordinator.join('white', '5+3', false, 1500)).status).toBe('queued');
    const matched = await f.coordinator.join('black', '5+3', false, 1500);
    if (matched.status !== 'assigned') throw new Error('assigned');
    const assigned = (send: { mock: { calls: unknown[][] } }) => send.mock.calls.filter((call) => JSON.parse(String(call[0])).status === 'assigned');
    expect(assigned(waiting.send)).toHaveLength(1); expect(assigned(joining.send)).toHaveLength(1);
    expect(assigned(waiting.send)[0][0]).toBe(assigned(joining.send)[0][0]);
    expect(JSON.parse(String(assigned(waiting.send)[0][0]))).toEqual({ status: 'assigned', match: matched.match });
    expect(JSON.parse(String(assigned(waiting.send)[0][0])).match.id).toBe(matched.match.id);
    expect(order.indexOf('ensure')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ensure')).toBeLessThan(order.indexOf('waiting'));
    expect(order.indexOf('ensure')).toBeLessThan(order.indexOf('joining'));
  });
  it('closes a socket that cannot accept a queue update', async () => {
    const f = coordinator();
    const socket = { player: 'one', readyState: 1, send: vi.fn(() => { throw new Error('gone'); }), close: vi.fn(), deserializeAttachment: () => ({ player: 'one' }) };
    f.sockets.push(socket);
    expect((await f.coordinator.join('one', '5+3', false, 1500)).status).toBe('queued');
    expect(socket.close).toHaveBeenCalledWith(1011, 'Reconnect');
  });
  it('rejects a matchmaking socket without a player or a websocket upgrade', async () => {
    const f = coordinator();
    expect((await f.coordinator.fetch(new Request('https://ludus.test'))).status).toBe(404);
    expect((await f.coordinator.fetch(new Request('https://ludus.test', { headers: { 'X-Player': 'white' } }))).status).toBe(426);
  });
  it('rejects expired invites, mixed queue entry, and repairs interrupted assignment initialisation', async () => {
    const f = coordinator(), invite = await f.coordinator.createInvite('owner', '5+3');
    await expect(f.coordinator.join('owner', '5+3', false, 1500)).rejects.toThrow('invite_active');
    vi.setSystemTime(invite.expiresAt); await expect(f.coordinator.redeem('other', invite.token, 'random')).rejects.toThrow('invalid_invite');
    expect(await f.coordinator.status('owner')).toEqual({ status: 'idle' });
    await f.coordinator.join('one', '5+3', false, 1500); f.initialise.mockRejectedValueOnce(new Error('network'));
    await expect(f.coordinator.join('two', '5+3', false, 1500)).rejects.toThrow('network');
    expect((await f.coordinator.status('one')).status).toBe('assigned');
    expect((await f.coordinator.status('two')).status).toBe('assigned');
    expect(f.initialise.mock.calls.at(-1)).toEqual(f.initialise.mock.calls.at(-2));
  });
});
function onlineEnv() {
  const createInvite = vi.fn(async () => ({ token: '11111111-1111-4111-8111-111111111111', expiresAt: 86401000 }));
  const redeem = vi.fn(async () => ({ status: 'assigned' as const, match: assignment }));
  const revokeInvite = vi.fn(async () => ({ status: 'idle' as const }));
  const fetch = vi.fn(async (_request: Request) => new Response(null, { status: 426 }));
  const env = { MATCHMAKING: { getByName: () => ({ createInvite, redeem, revokeInvite, fetch }) } } as unknown as Env;
  return { env, createInvite, redeem, revokeInvite, fetch };
}
async function postOnline(env: Env, path: string, data: Record<string, unknown>) {
  const origin = 'https://ludus.test';
  const response = await onlineApi(new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), env, 'guest');
  if (!response) throw new Error('missing');
  return response;
}
describe('online invitation HTTP and matchmaking socket', () => {
  it('accepts an invitation control and rejects a supplied colour', async () => {
    const { env, createInvite } = onlineEnv();
    const rejected = await postOnline(env, '/api/online/invitations', { control: '5+3', colour: 'w' });
    expect(rejected.status).toBe(400); expect(await rejected.json()).toEqual({ error: 'invalid' });
    expect(createInvite).not.toHaveBeenCalled();
    expect((await postOnline(env, '/api/online/invitations', { control: '3+0' })).status).toBe(400);
    const created = await postOnline(env, '/api/online/invitations', { control: '10+5' });
    expect(created.status).toBe(200); expect(createInvite).toHaveBeenCalledWith('guest', '10+5');
  });
  it('reports a missing invitation instead of a generic outage', async () => {
    const { env } = onlineEnv();
    env.MATCHMAKING.getByName = () => ({ redeem: vi.fn(async () => { throw new Error('not_found'); }) }) as unknown as Env['MATCHMAKING']['getByName'];
    const response = await postOnline(env, '/api/online/invitations/redeem', { token: '11111111-1111-4111-8111-111111111111', colour: 'w' });
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: 'not_found' });
  });
  it('requires a guest colour when redeeming an invitation', async () => {
    const { env, redeem, revokeInvite } = onlineEnv();
    const token = '11111111-1111-4111-8111-111111111111';
    expect((await postOnline(env, '/api/online/invitations/redeem', { token })).status).toBe(400);
    expect((await postOnline(env, '/api/online/invitations/redeem', { token, colour: 'white' })).status).toBe(400);
    expect((await postOnline(env, '/api/online/invitations/redeem', { token: 'nope', colour: 'w' })).status).toBe(400);
    expect(redeem).not.toHaveBeenCalled();
    const redeemed = await postOnline(env, '/api/online/invitations/redeem', { token, colour: 'random' });
    expect(redeemed.status).toBe(200); expect(redeem).toHaveBeenCalledWith('guest', token, 'random');
    const cancelled = await postOnline(env, '/api/online/invitations/cancel', { token });
    expect(cancelled.status).toBe(200); expect(revokeInvite).toHaveBeenCalledWith('guest', token);
  });
  it('upgrades the same-origin matchmaking socket with the player header', async () => {
    const { env, fetch } = onlineEnv();
    const origin = 'https://ludus.test';
    expect((await onlineApi(new Request(`${origin}/api/online/socket`, { headers: { Origin: 'https://evil.test' } }), env, 'white'))?.status).toBe(403);
    const response = await onlineApi(new Request(`${origin}/api/online/socket`, { headers: { Origin: origin } }), env, 'white');
    expect(response?.status).toBe(426); expect(fetch).toHaveBeenCalledOnce();
    const forwarded = fetch.mock.calls[0][0];
    expect(forwarded.headers.get('Upgrade')).toBe('websocket'); expect(forwarded.headers.get('X-Player')).toBe('white');
  });
});
function humanFixture(initial?: HumanGame) {
  const local = sqliteContext(), database = d1Database(), release = vi.fn().mockResolvedValue(undefined);
  const env = { DB: database.binding, MATCHMAKING: { getByName: () => ({ release }) } } as unknown as Env;
  const match = new HumanMatch(local.ctx, env);
  if (initial) local.db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(initial));
  return { ...local, database, release, match, saved: () => JSON.parse((local.db.prepare('SELECT data FROM state').get() as { data: string }).data) as HumanGame };
}
const active = () => humanConnection(humanConnection(createHumanGame('game', assignment.players, '5+3', false, 0), 'w', true, 0), 'b', true, 0);
describe('SQLite human match durability and authorisation', () => {
  it('rejects non-members for reads/actions/socket admission without exposing state', async () => {
    const f = humanFixture(active());
    expect(await f.match.read('stranger')).toBeNull();
    expect(await f.match.act('stranger', { type: 'resign', revision: 0 })).toEqual({ error: 'not_found' });
    expect((await f.match.fetch(new Request('https://ludus.test', { headers: { Upgrade: 'websocket', 'X-Player': 'stranger' } }))).status).toBe(404);
    expect(f.saved()).toEqual(active());
    await expect(f.match.phrase('stranger', 'hello')).rejects.toThrow('not_found');
    await expect(f.match.report('stranger', 'other')).rejects.toThrow('not_found');
  });
  it('accepts a revision once during simultaneous moves and stale retry', async () => {
    const f = humanFixture(active()), action = { type: 'move', from: 'e2', to: 'e4', revision: 0 };
    const results = await Promise.all([f.match.act('white', action), f.match.act('white', action)]);
    expect(results.filter((result) => 'game' in result)).toHaveLength(1);
    expect(f.saved().moves).toEqual(['e4']); expect(f.saved().clocks.w).toBe(302000);
  });
  it('retains a terminal retry alarm when D1 fails and applies finalisation exactly once', async () => {
    const f = humanFixture(active()); f.database.batch.mockRejectedValueOnce(new Error('D1 unavailable'));
    await expect(f.match.act('white', { type: 'resign', revision: 0 })).rejects.toThrow('D1 unavailable');
    expect(f.saved().result?.reason).toBe('resignation'); expect(f.storage.deleteAlarm).not.toHaveBeenCalled();
    await f.match.alarm(); await f.match.alarm();
    expect(f.database.db.prepare('SELECT * FROM online_results').all()).toEqual([{ match_id: 'game', processed: 1 }]);
    expect(f.database.db.prepare('SELECT count(*) AS count FROM online_matches').get()).toEqual({ count: 1 });
    expect(recordActivity).toHaveBeenCalledWith(f.database.binding, expect.objectContaining({ gameId: 'game', players: ['white', 'black'] }));
  });
  it('writes rating changes once under repeated result delivery and restores persisted state', async () => {
    // Infrastructure test bypasses entry guard only in fixture. Production rated entry remains disabled.
    const game = { ...active(), rated: true }, f = humanFixture(game);
    await f.match.act('white', { type: 'resign', revision: 0 });
    const first = f.database.db.prepare('SELECT * FROM ratings ORDER BY user_id').all();
    await Promise.all([f.match.alarm(), f.match.read('white'), f.match.read('black')]);
    expect(f.database.db.prepare('SELECT * FROM ratings ORDER BY user_id').all()).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first.every((row) => row.games === 1 && row.control === '5+3')).toBe(true);
    expect(f.database.db.prepare('SELECT count(*) AS count FROM ratings WHERE control=?').get('10+5')).toEqual({ count: 0 });
  });
  it('delivers preset IDs only to opposing sockets and keeps duplicate tabs connected', async () => {
    const f = humanFixture(active());
    const socket = (player: string) => ({ player, readyState: 1, send: vi.fn(), close: vi.fn(), deserializeAttachment: () => ({ player }) });
    const own = socket('white'), duplicate = socket('white'), opponent = socket('black');
    f.sockets.push(own, duplicate, opponent);
    await f.match.phrase('white', 'hello');
    expect(own.send).not.toHaveBeenCalled(); expect(duplicate.send).not.toHaveBeenCalled();
    expect(opponent.send).toHaveBeenCalledWith(JSON.stringify({ phrase: 'hello', from: 'w', at: 1000 }));
    await f.match.webSocketClose(own as unknown as WebSocket, 1000);
    expect(f.saved().disconnected.w).toBe(false);
    own.readyState = 3;
    await f.match.webSocketClose(duplicate as unknown as WebSocket, 1000);
    expect(f.saved().disconnected.w).toBe(true);
    expect(f.saved().disconnected.b).toBe(false);
  });
  it('rate-limits validated preset IDs and deduplicates member reports', async () => {
    const f = humanFixture(active());
    await f.match.phrase('white', 'hello'); await expect(f.match.phrase('white', 'goodGame')).rejects.toThrow('rate_limited');
    vi.setSystemTime(4000); await expect(f.match.phrase('white', 'goodGame')).resolves.toEqual({ ok: true });
    await f.match.report('white', 'assistance'); await f.match.report('white', 'assistance');
    expect(f.database.db.prepare('SELECT count(*) AS count FROM match_reports').get()).toEqual({ count: 1 });
  });
});

describe('human account erasure', () => {
  it('revokes the deleted seat and preserves opponent replay and cleanup retries', async () => {
    const f = humanFixture(active());
    const socket = { player: 'white', readyState: 1, send: vi.fn(), close: vi.fn(), deserializeAttachment: () => ({ player: 'white' }) };
    f.sockets.push(socket);
    f.database.db.prepare('INSERT INTO account_deletions VALUES(?)').run('white');
    await f.match.anonymise('white');
    expect(socket.close).toHaveBeenCalledWith(1008, 'Account deleted');
    expect(f.saved().players.w).toBe('deleted:white');
    expect(f.saved().result?.reason).toBe('resignation');
    const terminal = f.saved();
    expect(await f.match.read('white')).toBeNull();
    expect((await f.match.read('black'))?.game.moves).toEqual(terminal.moves);
    await f.match.anonymise('white');
    expect(f.saved()).toEqual(terminal);
    expect(f.database.db.prepare('SELECT white_id FROM online_matches').get()).toEqual({ white_id: 'deleted:white' });
    expect(f.release).toHaveBeenCalled();
  });
  it('refuses a late initialisation after a player deleted their account', async () => {
    const f = humanFixture(); f.database.db.prepare('INSERT INTO account_deletions VALUES(?)').run('white');
    await expect(f.match.initialise(assignment)).rejects.toThrow('account_deleted');
    expect(f.database.db.prepare('SELECT count(*) AS count FROM online_matches').get()).toEqual({ count: 0 });
  });
});
