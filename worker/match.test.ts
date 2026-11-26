import { connection, createGame } from '../shared/game';
import type { Game } from '../shared/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('./accounts', () => ({ recordActivity: vi.fn() }));
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: DurableObjectState,
      public env: Env,
    ) {}
  },
}));
vi.mock('drizzle-orm/d1', () => ({
  drizzle: () => ({
    update: () => ({ set: (value: unknown) => ({ where: () => database.write(value) }) }),
  }),
}));
import { Match } from './match';

function fixture(
  initial: Game | null = connection(createGame('match', 'owner', '5+3', 1, 'w', 1000), true, 1000),
) {
  let stored = initial ? JSON.stringify(initial) : undefined;
  let revoked = false;
  const sockets: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
  const sql = vi.fn((query: string, value?: string) => {
    if (query.startsWith('INSERT')) {
      stored = value;
    }
    return { toArray: () => (stored ? [{ data: stored }] : []) };
  });
  const ctx = {
    storage: { sql: { exec: sql }, setAlarm: vi.fn(), deleteAlarm: vi.fn() },
    getWebSockets: () => sockets,
    acceptWebSocket: vi.fn(),
  };
  const match = new Match(
    ctx as unknown as DurableObjectState,
    {
      DB: {
        prepare: () => ({
          bind: () => ({ first: async () => (revoked ? { user_id: 'owner' } : null) }),
        }),
      },
      MATCHMAKING: { getByName: () => ({ releaseComputer: vi.fn() }) },
    } as unknown as Env,
  );
  return {
    match,
    ctx,
    sockets,
    setDeleted: (value: boolean) => {
      revoked = value;
    },
    saved: () => JSON.parse(stored!) as Game,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  database.write.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('match ownership', () => {
  it('rejects another account before reads, actions or socket admission mutate state', async () => {
    // Arrange
    const { match, ctx, saved } = fixture();
    const before = saved();
    const readResult = await match.read('intruder');
    const actResult = await match.act('intruder', { type: 'resign', revision: 0 });

    // Act
    const response = await match.fetch(
      new Request('https://example.com', {
        headers: { 'X-Player': 'intruder', Upgrade: 'websocket' },
      }),
    );

    // Assert
    expect(readResult).toBeNull();
    expect(actResult).toEqual({ error: 'not_found' });
    expect(response.status).toBe(404);
    expect(ctx.acceptWebSocket).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
    expect(saved()).toEqual(before);
  });

  it('does not expose missing games and requires an actual socket upgrade', async () => {
    // Arrange
    const missing = fixture(null).match;
    const readResult = await missing.read('owner');
    const actResult = await missing.act('owner', { type: 'resign', revision: 0 });
    const missingResponse = await missing.fetch(new Request('https://example.com'));
    const present = fixture().match;

    // Act
    const upgradeResponse = await present.fetch(
      new Request('https://example.com', { headers: { 'X-Player': 'owner' } }),
    );

    // Assert
    expect(readResult).toBeNull();
    expect(actResult).toEqual({ error: 'not_found' });
    expect(missingResponse.status).toBe(404);
    expect(upgradeResponse.status).toBe(426);
  });
});

describe('socket admission', () => {
  it('delivers the resumed snapshot on the upgrading socket without closing it', async () => {
    // Arrange
    const sent: string[] = [];
    const close = vi.fn();
    class Pair {
      0 = { send: vi.fn(), close: vi.fn() };
      1 = {
        send: vi.fn((data: string) => {
          sent.push(data);
        }),
        close,
      };
    }
    class AllowedResponse {
      status: number;
      webSocket: unknown;
      constructor(_body: unknown, init?: { status?: number; webSocket?: unknown }) {
        this.status = init?.status ?? 200;
        this.webSocket = init?.webSocket ?? null;
      }
    }
    vi.stubGlobal('WebSocketPair', Pair);
    vi.stubGlobal('Response', AllowedResponse);
    const { match, ctx, saved } = fixture(createGame('match', 'owner', '5+3', 1, 'w', 1000));

    // Act
    const response = await match.fetch(
      new Request('https://example.com', {
        headers: { 'X-Player': 'owner', Upgrade: 'websocket' },
      }),
    );

    // Assert
    try {
      expect(response.status).toBe(101);
      expect(ctx.acceptWebSocket).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]).game.pauseStarted).toBeNull();
      expect(saved().pauseStarted).toBeNull();
      expect(close).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('still pauses the clock when the closing socket rejects another close', async () => {
    // Arrange
    const { match, sockets, saved } = fixture();
    const socket = {
      send: vi.fn(),
      close: vi.fn(() => {
        throw new Error('already closed');
      }),
      readyState: 1,
    };
    sockets.push(socket);

    // Act
    await match.webSocketClose(socket as unknown as WebSocket, 1006);

    // Assert
    expect(saved().pauseStarted).not.toBeNull();
  });
});

describe('durable finalisation', () => {
  it('retries terminal persistence after D1 failure without accepting another action', async () => {
    // Arrange
    const { match, ctx, saved } = fixture();
    database.write.mockRejectedValueOnce(new Error('D1 unavailable'));
    let failure: unknown;
    try {
      await match.act('owner', { type: 'resign', revision: 0 });
    } catch (error) {
      failure = error;
    }
    const completed = saved();
    const deleteAlarmCallsBeforeRetry = [...ctx.storage.deleteAlarm.mock.calls];

    // Act
    const retried = await match.act('owner', { type: 'move', from: 'e2', to: 'e4', revision: 0 });

    // Assert
    await expect(Promise.reject(failure)).rejects.toThrow('D1 unavailable');
    expect(completed.result).toEqual({ winner: 'b', reason: 'resignation' });
    expect(deleteAlarmCallsBeforeRetry).toEqual([]);
    expect('game' in retried && retried.game).toEqual(completed);
    expect(saved()).toEqual(completed);
    expect(database.write).toHaveBeenCalledTimes(2);
    expect(database.write.mock.calls[0]).toEqual(database.write.mock.calls[1]);
    expect(ctx.storage.deleteAlarm).toHaveBeenCalledTimes(1);
  });

  it('finalises timeout on read and keeps the result and revision stable on repeated alarms', async () => {
    // Arrange
    const { match, ctx, saved } = fixture();
    vi.setSystemTime(301_000);
    const result = await match.read('owner');
    const completed = saved();

    // Act
    await match.alarm().then(() => match.alarm());

    // Assert
    expect(result?.game.result).toEqual({ winner: 'b', reason: 'timeout' });
    expect(saved()).toEqual(completed);
    expect(ctx.storage.setAlarm).toHaveBeenCalledWith(306_000);
    expect(database.write).toHaveBeenCalledTimes(3);
  });

  it('rejects stale retries without repeating moves or increments', async () => {
    // Arrange
    const { match, saved } = fixture();
    const action = { type: 'move', from: 'e2', to: 'e4', revision: 0 };
    await match.act('owner', action);
    const accepted = saved();

    // Act
    const retry = await match.act('owner', action);

    // Assert
    expect(retry).toMatchObject({ error: 'invalid_action' });
    expect(saved()).toEqual(accepted);
    expect(accepted.moves).toEqual(['e4']);
    expect(accepted.clocks.w).toBe(302_000);
  });
});

describe('account erasure in retained matches', () => {
  it('redacts durable ownership, revokes sockets and prevents the old account reading', async () => {
    // Arrange
    const { match, sockets, saved, ctx } = fixture();
    const socket = { send: vi.fn(), close: vi.fn() };
    sockets.push(socket);
    await match.anonymise('intruder');
    const ownerAfterIntruder = saved().owner;
    const closeCallsAfterIntruder = [...socket.close.mock.calls];

    // Act
    await match.anonymise('owner');

    // Assert
    expect(ownerAfterIntruder).toBe('owner');
    expect(closeCallsAfterIntruder).toEqual([]);
    expect(saved().owner).toBe('deleted');
    expect(saved().result?.reason).toBe('resignation');
    await expect(match.read('owner')).resolves.toBeNull();
    expect(socket.close).toHaveBeenCalledWith(1008, 'Account deleted');
    expect(ctx.storage.deleteAlarm).toHaveBeenCalledWith();
  });
});

describe('computer admission and deletion races', () => {
  it('denies late initialisation after deletion without creating durable state', async () => {
    // Arrange
    const f = fixture(null);
    f.setDeleted(true);

    // Act
    const initialised = f.match.initialise('match', 'owner', '5+3', 1, 'w');

    // Assert
    await expect(initialised).rejects.toThrow('account_deleted');
    expect(database.write).not.toHaveBeenCalled();
  });

  it('uses current durable revision after asynchronous authorisation', async () => {
    // Arrange
    const f = fixture();
    const action = { type: 'move', from: 'e2', to: 'e4', revision: 0 };

    // Act
    const results = await Promise.all([f.match.act('owner', action), f.match.act('owner', action)]);

    // Assert
    expect(results.filter((result) => 'error' in result)).toHaveLength(1);
    expect(f.saved().moves).toEqual(['e4']);
    expect(f.saved().revision).toBe(1);
  });

  it('revokes already admitted sockets when a tombstone appears', async () => {
    // Arrange
    const f = fixture();
    const socket = { send: vi.fn(), close: vi.fn() };
    f.sockets.push(socket);
    f.setDeleted(true);

    // Act
    const read = await f.match.read('owner');

    // Assert
    expect(read).toBeNull();
    expect(f.saved().owner).toBe('deleted');
    expect(socket.close).toHaveBeenCalledWith(1008, 'Account deleted');
  });
});
