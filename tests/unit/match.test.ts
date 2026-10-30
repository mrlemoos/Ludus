import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connection, createGame, type Game } from '../../shared/game';

const database = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(public ctx: DurableObjectState, public env: Env) {}
  },
}));
vi.mock('drizzle-orm/d1', () => ({ drizzle: () => ({ update: () => ({ set: (value: unknown) => ({ where: () => database.write(value) }) }) }) }));
import { Match } from '../../worker/match';

function fixture(initial: Game | null = connection(createGame('match', 'owner', '5+3', 1, 'w', 1000), true, 1000)) {
  let stored = initial ? JSON.stringify(initial) : undefined;
  const sockets: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
  const sql = vi.fn((query: string, value?: string) => {
    if (query.startsWith('INSERT')) stored = value;
    return { toArray: () => stored ? [{ data: stored }] : [] };
  });
  const ctx = {
    storage: { sql: { exec: sql }, setAlarm: vi.fn(), deleteAlarm: vi.fn() },
    getWebSockets: () => sockets,
    acceptWebSocket: vi.fn(),
  };
  const match = new Match(ctx as unknown as DurableObjectState, { DB: {} } as Env);
  return { match, ctx, sockets, saved: () => JSON.parse(stored!) as Game };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  database.write.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('match ownership', () => {
  it('rejects another account before reads, actions or socket admission mutate state', async () => {
    const { match, ctx, saved } = fixture();
    const before = saved();
    expect(await match.read('intruder')).toBeNull();
    expect(await match.act('intruder', { type: 'resign', revision: 0 })).toEqual({ error: 'not_found' });
    const response = await match.fetch(new Request('https://example.com', { headers: { 'X-Player': 'intruder', Upgrade: 'websocket' } }));
    expect(response.status).toBe(404);
    expect(ctx.acceptWebSocket).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
    expect(saved()).toEqual(before);
  });

  it('does not expose missing games and requires an actual socket upgrade', async () => {
    const missing = fixture(null).match;
    expect(await missing.read('owner')).toBeNull();
    expect(await missing.act('owner', { type: 'resign', revision: 0 })).toEqual({ error: 'not_found' });
    expect((await missing.fetch(new Request('https://example.com'))).status).toBe(404);
    expect((await fixture().match.fetch(new Request('https://example.com', { headers: { 'X-Player': 'owner' } }))).status).toBe(426);
  });
});

describe('durable finalisation', () => {
  it('retries terminal persistence after D1 failure without accepting another action', async () => {
    const { match, ctx, saved } = fixture();
    database.write.mockRejectedValueOnce(new Error('D1 unavailable'));
    await expect(match.act('owner', { type: 'resign', revision: 0 })).rejects.toThrow('D1 unavailable');
    const completed = saved();
    expect(completed.result).toEqual({ winner: 'b', reason: 'resignation' });
    expect(ctx.storage.deleteAlarm).not.toHaveBeenCalled();
    const retried = await match.act('owner', { type: 'move', from: 'e2', to: 'e4', revision: 0 });
    expect('game' in retried && retried.game).toEqual(completed);
    expect(saved()).toEqual(completed);
    expect(database.write).toHaveBeenCalledTimes(2);
    expect(database.write.mock.calls[0]).toEqual(database.write.mock.calls[1]);
    expect(ctx.storage.deleteAlarm).toHaveBeenCalledOnce();
  });

  it('finalises timeout on read and keeps the result and revision stable on repeated alarms', async () => {
    const { match, ctx, saved } = fixture();
    vi.setSystemTime(301000);
    const result = await match.read('owner');
    expect(result?.game.result).toEqual({ winner: 'b', reason: 'timeout' });
    const completed = saved();
    await match.alarm();
    await match.alarm();
    expect(saved()).toEqual(completed);
    expect(ctx.storage.setAlarm).not.toHaveBeenCalled();
    expect(database.write).toHaveBeenCalledTimes(3);
  });

  it('rejects stale retries without repeating moves or increments', async () => {
    const { match, saved } = fixture();
    const action = { type: 'move', from: 'e2', to: 'e4', revision: 0 };
    await match.act('owner', action);
    const accepted = saved();
    const retry = await match.act('owner', action);
    expect(retry).toMatchObject({ error: 'invalid_action' });
    expect(saved()).toEqual(accepted);
    expect(accepted.moves).toEqual(['e4']);
    expect(accepted.clocks.w).toBe(302000);
  });
});
