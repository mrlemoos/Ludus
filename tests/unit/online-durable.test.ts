import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: DurableObjectState, public env: Env) {} } }));
vi.mock('../../worker/accounts', () => ({ recordActivity: vi.fn() }));
import { recordActivity } from '../../worker/accounts';
import { Matchmaking } from '../../worker/matchmaking';
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
    await expect(f.coordinator.createInvite('one', '5+3', 'w')).rejects.toThrow('busy');
    const invite = await f.coordinator.createInvite('friend', '5+3', 'w');
    await expect(f.coordinator.redeem('one', invite.token)).rejects.toThrow('busy');
    await f.coordinator.releaseComputer('one', 'stale');
    expect(await f.coordinator.status('one')).toEqual({ status: 'computer', id: 'computer' });
    await f.coordinator.releaseComputer('one', 'computer');
    const queued = await f.coordinator.join('one', '5+3', false, 1500);
    await expect(f.coordinator.reserveComputer('one', 'another')).rejects.toThrow('busy');
    expect(queued.status).toBe('queued');
  });
  it('redeems invitations only once and persists random colour and game ID over retries', async () => {
    const f = coordinator(), invite = await f.coordinator.createInvite('owner', '10+5', 'random');
    expect(invite.expiresAt).toBe(86401000);
    await expect(f.coordinator.redeem('owner', invite.token)).rejects.toThrow('invalid_invite');
    const first = await f.coordinator.redeem('friend', invite.token), retry = await f.coordinator.redeem('friend', invite.token);
    expect(first).toEqual(retry); expect(first.match.rated).toBe(false);
    expect(Object.values(first.match.players).sort()).toEqual(['friend', 'owner']);
    await expect(f.coordinator.redeem('other', invite.token)).rejects.toThrow('redeemed');
    await f.coordinator.release(first.match.id, ['owner', 'friend']);
    expect(await f.coordinator.status('owner')).toEqual({ status: 'idle' });
  });
  it('rejects expired invites, mixed queue entry, and repairs interrupted assignment initialisation', async () => {
    const f = coordinator(), invite = await f.coordinator.createInvite('owner', '5+3', 'w');
    await expect(f.coordinator.join('owner', '5+3', false, 1500)).rejects.toThrow('invite_active');
    vi.setSystemTime(invite.expiresAt); await expect(f.coordinator.redeem('other', invite.token)).rejects.toThrow('invalid_invite');
    expect(await f.coordinator.status('owner')).toEqual({ status: 'idle' });
    await f.coordinator.join('one', '5+3', false, 1500); f.initialise.mockRejectedValueOnce(new Error('network'));
    await expect(f.coordinator.join('two', '5+3', false, 1500)).rejects.toThrow('network');
    expect((await f.coordinator.status('one')).status).toBe('assigned');
    expect((await f.coordinator.status('two')).status).toBe('assigned');
    expect(f.initialise.mock.calls.at(-1)).toEqual(f.initialise.mock.calls.at(-2));
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
