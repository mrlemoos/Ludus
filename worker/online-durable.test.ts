import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: DurableObjectState,
      public env: Env,
    ) {}
  },
}));
vi.mock('./accounts', () => ({ recordActivity: vi.fn() }));
import { createHumanGame, humanConnection } from '../shared/human-game';
import type { HumanGame } from '../shared/human-game';
import type { Assignment } from '../shared/matchmaking';
import { recordActivity } from './accounts';
import { HumanMatch } from './human-match';
import { Matchmaking } from './matchmaking';
import { onlineApi } from './online-api';

function sqliteContext() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: {
      exec(query: string, ...bindings: SQLInputValue[]) {
        if (bindings.length === 0 && query.startsWith('CREATE')) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const rows = db.prepare(query).all(...bindings);
        return { toArray: () => rows };
      },
    },
    setAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAlarm: vi.fn().mockResolvedValue(undefined),
  };
  const sockets: {
    player: string;
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    deserializeAttachment: () => { player: string };
  }[] = [];
  return {
    db,
    storage,
    sockets,
    ctx: {
      storage,
      getWebSockets: (tag?: string) => sockets.filter((socket) => !tag || socket.player === tag),
      acceptWebSocket: vi.fn(),
    } as unknown as DurableObjectState,
  };
}
function d1Database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('drizzle/0004_online.sql', 'utf8'));
  db.exec('CREATE TABLE account_deletions(user_id TEXT PRIMARY KEY)');
  function prepare(query: string) {
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...params: SQLInputValue[]) {
        values = params;
        return statement;
      },
      async run() {
        return db.prepare(query).run(...values);
      },
      async all() {
        return { results: db.prepare(query).all(...values) };
      },
      async first() {
        return db.prepare(query).get(...values) ?? null;
      },
      execute() {
        return db.prepare(query).run(...values);
      },
    };
    return statement;
  }
  const batch = vi.fn(async (statements: ReturnType<typeof prepare>[]) => {
    db.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  return { db, batch, binding: { prepare, batch } as unknown as D1Database };
}
function coordinator() {
  const local = sqliteContext();
  const initialise = vi.fn().mockResolvedValue(undefined);
  const env = { HUMAN_MATCHES: { getByName: () => ({ initialise }) } } as unknown as Env;
  return { ...local, initialise, coordinator: new Matchmaking(local.ctx, env) };
}
const assignment: Assignment = {
  id: 'game',
  players: { w: 'white', b: 'black' },
  control: '5+3',
  rated: false,
  createdAt: 0,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
describe('sQLite matchmaking assignment races', () => {
  it('reserves both users before awaiting match initialisation; cancellation cannot steal an assignment', async () => {
    // Arrange
    const f = coordinator();
    const first = await f.coordinator.join('white', '5+3', false, 1500);
    if (first.status !== 'queued') {
      throw new Error('queued');
    }
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.initialise.mockReturnValue(held);
    const matching = f.coordinator.join('black', '5+3', false, 1500);
    const cancellation = f.coordinator.cancel('white', first.entry.token);
    release();

    // Act
    const [matched, cancelled] = await Promise.all([matching, cancellation]);

    // Assert
    expect(first.status).toBe('queued');
    expect(matched.status).toBe('assigned');
    expect(cancelled.status).toBe('assigned');
    if (matched.status !== 'assigned' || cancelled.status !== 'assigned') {
      throw new Error('assigned');
    }
    expect(cancelled.match.id).toBe(matched.match.id);
    expect(matched.match.players).toEqual({ w: 'white', b: 'black' });
    await expect(f.coordinator.join('white', '10+5', false, 1500)).resolves.toMatchObject({
      status: 'assigned',
      match: { id: matched.match.id },
    });
  });

  it('cancels before assignment and requires explicit delayed AI acceptance with exact token', async () => {
    // Arrange
    const f = coordinator();
    const queued = await f.coordinator.join('one', '5+3', false, 1500);
    if (queued.status !== 'queued') {
      throw new Error('queued');
    }
    let early: unknown;
    try {
      await f.coordinator.cancel('one', queued.entry.token, true);
    } catch (error) {
      early = error;
    }
    vi.setSystemTime(31_000);
    let stale: unknown;
    try {
      await f.coordinator.cancel('one', 'stale', true);
    } catch (error) {
      stale = error;
    }

    // Act
    const accepted = await f.coordinator.cancel('one', queued.entry.token, true);

    // Assert
    await expect(async () => {
      throw early;
    }).rejects.toThrow('too_early');
    await expect(async () => {
      throw stale;
    }).rejects.toThrow('stale_queue');
    expect(accepted).toEqual({ status: 'idle', aiAccepted: true });
    const other = await f.coordinator.join('two', '5+3', false, 1500);
    expect(other.status).toBe('queued');
    expect(f.initialise).not.toHaveBeenCalled();
  });

  it('reserves computer matches atomically against queue, invitation and redemption', async () => {
    // Arrange
    const f = coordinator();
    await f.coordinator.reserveComputer('one', 'computer');
    const second = await f.coordinator.reserveComputer('one', 'computer');
    let joinError: unknown;
    try {
      await f.coordinator.join('one', '5+3', false, 1500);
    } catch (error) {
      joinError = error;
    }
    let inviteError: unknown;
    try {
      await f.coordinator.createInvite('one', '5+3');
    } catch (error) {
      inviteError = error;
    }
    const invite = await f.coordinator.createInvite('friend', '5+3');
    let redeemError: unknown;
    try {
      await f.coordinator.redeem('one', invite.token, 'b');
    } catch (error) {
      redeemError = error;
    }
    await f.coordinator.releaseComputer('one', 'stale');
    const duringComputer = await f.coordinator.status('one');
    await f.coordinator.releaseComputer('one', 'computer');
    const queued = await f.coordinator.join('one', '5+3', false, 1500);

    // Act
    const reserveWhileQueued = f.coordinator.reserveComputer('one', 'another');

    // Assert
    expect(second).toEqual({ reserved: true });
    await expect(async () => {
      throw joinError;
    }).rejects.toThrow('computer_active');
    await expect(async () => {
      throw inviteError;
    }).rejects.toThrow('busy');
    await expect(async () => {
      throw redeemError;
    }).rejects.toThrow('busy');
    expect(duringComputer).toEqual({ status: 'computer', id: 'computer' });
    await expect(reserveWhileQueued).rejects.toThrow('busy');
    expect(queued.status).toBe('queued');
  });

  it('issues a new link when the saved invitation is gone', async () => {
    // Arrange
    const f = coordinator();
    const invite = await f.coordinator.createInvite('owner', '5+3');
    f.db.prepare('DELETE FROM invites WHERE token=?').run(invite.token);
    const idle = await f.coordinator.status('owner');

    // Act
    const next = await f.coordinator.createInvite('owner', '5+3');

    // Assert
    expect(idle).toEqual({ status: 'idle' });
    expect(next.token).not.toBe(invite.token);
    const joined = await f.coordinator.redeem('friend', next.token, 'b');
    expect(joined.match.players).toEqual({ w: 'owner', b: 'friend' });
  });

  it('redeems invitations only once and keeps the first seats when the guest retries another colour', async () => {
    // Arrange
    const f = coordinator();
    const invite = await f.coordinator.createInvite('owner', '10+5');
    let ownerError: unknown;
    try {
      await f.coordinator.redeem('owner', invite.token, 'random');
    } catch (error) {
      ownerError = error;
    }
    const first = await f.coordinator.redeem('friend', invite.token, 'w');

    // Act
    const retry = await f.coordinator.redeem('friend', invite.token, 'b');

    // Assert
    expect(invite.expiresAt).toBe(86_401_000);
    await expect(async () => {
      throw ownerError;
    }).rejects.toThrow('invalid_invite');
    expect(first).toEqual(retry);
    expect(first.match.rated).toBe(false);
    expect(first.match.players).toEqual({ w: 'friend', b: 'owner' });
    expect(retry.match.id).toBe(first.match.id);
    expect(retry.match.players).toEqual(first.match.players);
    expect(Object.values(first.match.players).sort()).toEqual(['friend', 'owner']);
    await expect(f.coordinator.redeem('other', invite.token, 'w')).rejects.toThrow('redeemed');
    await f.coordinator.release(first.match.id, ['owner', 'friend']);
    await expect(f.coordinator.status('owner')).resolves.toEqual({ status: 'idle' });
  });

  it('seats the guest on the requested side and keeps friend matches casual', async () => {
    // Arrange
    const original = crypto.getRandomValues.bind(crypto);
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array && array.length === 1) {
        array[0] = 255;
      } else {
        return original(array);
      }
      return array;
    });
    try {
      const white = coordinator();
      const whiteInvite = await white.coordinator.createInvite('host', '5+3');
      const asWhite = await white.coordinator.redeem('guest', whiteInvite.token, 'w');
      spy.mockImplementation((array) => {
        if (array instanceof Uint8Array && array.length === 1) {
          array[0] = 0;
        } else {
          return original(array);
        }
        return array;
      });
      const black = coordinator();
      const blackInvite = await black.coordinator.createInvite('host', '10+5');

      // Act
      const asBlack = await black.coordinator.redeem('guest', blackInvite.token, 'b');

      // Assert
      expect(asWhite.match.players).toEqual({ w: 'guest', b: 'host' });
      expect(asWhite.match.rated).toBe(false);
      expect(asBlack.match.players).toEqual({ w: 'host', b: 'guest' });
      expect(asBlack.match.rated).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('rolls random guest colour once on the server and ignores a later colour', async () => {
    // Arrange
    const original = crypto.getRandomValues.bind(crypto);
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array && array.length === 1) {
        array[0] = 127;
      } else {
        return original(array);
      }
      return array;
    });
    function rolls() {
      return spy.mock.calls.filter((call) => call[0] instanceof Uint8Array && call[0].length === 1)
        .length;
    }
    try {
      const low = coordinator();
      const lowInvite = await low.coordinator.createInvite('host', '5+3');
      const lowMatch = await low.coordinator.redeem('guest', lowInvite.token, 'random');
      const rollsAfterLow = rolls();
      const retry = await low.coordinator.redeem('guest', lowInvite.token, 'b');
      const rollsAfterRetry = rolls();
      spy.mockImplementation((array) => {
        if (array instanceof Uint8Array && array.length === 1) {
          array[0] = 128;
        } else {
          return original(array);
        }
        return array;
      });
      const high = coordinator();
      const highInvite = await high.coordinator.createInvite('host', '10+5');

      // Act
      const highMatch = await high.coordinator.redeem('guest', highInvite.token, 'random');

      // Assert
      expect(lowMatch.match.players).toEqual({ w: 'guest', b: 'host' });
      expect(rollsAfterLow).toBe(1);
      expect(retry.match.id).toBe(lowMatch.match.id);
      expect(retry.match.players).toEqual(lowMatch.match.players);
      expect(rollsAfterRetry).toBe(1);
      expect(highMatch.match.players).toEqual({ w: 'host', b: 'guest' });
      expect(highMatch.match.rated).toBe(false);
      expect(rolls()).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('pushes one assigned match to both players after initialisation', async () => {
    // Arrange
    const f = coordinator();
    function socket(player: string) {
      return {
        player,
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        deserializeAttachment: () => ({ player }),
      };
    }
    const waiting = socket('white');
    const joining = socket('black');
    f.sockets.push(waiting, joining);
    const order: string[] = [];
    f.initialise.mockImplementation(async () => {
      order.push('ensure');
    });
    waiting.send.mockImplementation((payload: string) => {
      if (JSON.parse(payload).status === 'assigned') {
        order.push('waiting');
      }
    });
    joining.send.mockImplementation((payload: string) => {
      if (JSON.parse(payload).status === 'assigned') {
        order.push('joining');
      }
    });
    function assigned(send: { mock: { calls: unknown[][] } }) {
      return send.mock.calls.filter((call) => JSON.parse(String(call[0])).status === 'assigned');
    }
    const queued = await f.coordinator.join('white', '5+3', false, 1500);

    // Act
    const matched = await f.coordinator.join('black', '5+3', false, 1500);

    // Assert
    expect(queued.status).toBe('queued');
    if (matched.status !== 'assigned') {
      throw new Error('assigned');
    }
    expect(assigned(waiting.send)).toHaveLength(1);
    expect(assigned(joining.send)).toHaveLength(1);
    expect(assigned(waiting.send)[0][0]).toBe(assigned(joining.send)[0][0]);
    expect(JSON.parse(String(assigned(waiting.send)[0][0]))).toEqual({
      status: 'assigned',
      match: matched.match,
    });
    expect(JSON.parse(String(assigned(waiting.send)[0][0])).match.id).toBe(matched.match.id);
    expect(order.indexOf('ensure')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ensure')).toBeLessThan(order.indexOf('waiting'));
    expect(order.indexOf('ensure')).toBeLessThan(order.indexOf('joining'));
  });

  it('closes a socket that cannot accept a queue update', async () => {
    // Arrange
    const f = coordinator();
    const socket = {
      player: 'one',
      readyState: 1,
      send: vi.fn(() => {
        throw new Error('gone');
      }),
      close: vi.fn(),
      deserializeAttachment: () => ({ player: 'one' }),
    };
    f.sockets.push(socket);

    // Act
    const joined = await f.coordinator.join('one', '5+3', false, 1500);

    // Assert
    expect(joined.status).toBe('queued');
    expect(socket.close).toHaveBeenCalledWith(1011, 'Reconnect');
  });

  it('rejects a matchmaking socket without a player or a websocket upgrade', async () => {
    // Arrange
    const f = coordinator();
    const missingPlayer = await f.coordinator.fetch(new Request('https://ludus.test'));

    // Act
    const missingUpgrade = await f.coordinator.fetch(
      new Request('https://ludus.test', { headers: { 'X-Player': 'white' } }),
    );

    // Assert
    expect(missingPlayer.status).toBe(404);
    expect(missingUpgrade.status).toBe(426);
  });

  it('rejects expired invites, mixed queue entry, and repairs interrupted assignment initialisation', async () => {
    // Arrange
    const f = coordinator();
    const invite = await f.coordinator.createInvite('owner', '5+3');
    let inviteActive: unknown;
    try {
      await f.coordinator.join('owner', '5+3', false, 1500);
    } catch (error) {
      inviteActive = error;
    }
    vi.setSystemTime(invite.expiresAt);
    let expired: unknown;
    try {
      await f.coordinator.redeem('other', invite.token, 'random');
    } catch (error) {
      expired = error;
    }
    const idle = await f.coordinator.status('owner');
    await f.coordinator.join('one', '5+3', false, 1500);
    f.initialise.mockRejectedValueOnce(new Error('network'));

    // Act
    const repair = f.coordinator.join('two', '5+3', false, 1500);

    // Assert
    await expect(async () => {
      throw inviteActive;
    }).rejects.toThrow('invite_active');
    await expect(async () => {
      throw expired;
    }).rejects.toThrow('invalid_invite');
    expect(idle).toEqual({ status: 'idle' });
    await expect(repair).rejects.toThrow('network');
    expect((await f.coordinator.status('one')).status).toBe('assigned');
    expect((await f.coordinator.status('two')).status).toBe('assigned');
    expect(f.initialise.mock.calls.at(-1)).toEqual(f.initialise.mock.calls.at(-2));
  });
});
function onlineEnv() {
  const createInvite = vi.fn(async () => ({
    token: '11111111-1111-4111-8111-111111111111',
    expiresAt: 86_401_000,
  }));
  const redeem = vi.fn(async () => ({ status: 'assigned' as const, match: assignment }));
  const revokeInvite = vi.fn(async () => ({ status: 'idle' as const }));
  const fetch = vi.fn(
    async (_request: Request, _init?: RequestInit) => new Response(null, { status: 426 }),
  );
  const env = {
    MATCHMAKING: { getByName: () => ({ createInvite, redeem, revokeInvite, fetch }) },
  } as unknown as Env;
  return { env, createInvite, redeem, revokeInvite, fetch };
}
async function postOnline(env: Env, path: string, data: Record<string, unknown>) {
  const origin = 'https://ludus.test';
  const response = await onlineApi(
    new Request(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    env,
    'guest',
  );
  if (!response) {
    throw new Error('missing');
  }
  return response;
}
describe('online invitation HTTP and matchmaking socket', () => {
  it('accepts an invitation control and rejects a supplied colour', async () => {
    // Arrange
    const { env, createInvite } = onlineEnv();
    const rejected = await postOnline(env, '/api/online/invitations', {
      control: '5+3',
      colour: 'w',
    });
    const invalidControl = await postOnline(env, '/api/online/invitations', { control: '3+0' });
    const callsBeforeCreate = createInvite.mock.calls.length;

    // Act
    const created = await postOnline(env, '/api/online/invitations', { control: '10+5' });

    // Assert
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ error: 'invalid' });
    expect(callsBeforeCreate).toBe(0);
    expect(invalidControl.status).toBe(400);
    expect(created.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith('guest', '10+5');
  });

  it('reports a missing invitation instead of a generic outage', async () => {
    // Arrange
    const { env } = onlineEnv();
    env.MATCHMAKING.getByName = (() => ({
      redeem: async () => {
        throw new Error('not_found');
      },
    })) as unknown as typeof env.MATCHMAKING.getByName;

    // Act
    const response = await postOnline(env, '/api/online/invitations/redeem', {
      token: '11111111-1111-4111-8111-111111111111',
      colour: 'w',
    });

    // Assert
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('requires a guest colour when redeeming an invitation', async () => {
    // Arrange
    const { env, redeem, revokeInvite } = onlineEnv();
    const token = '11111111-1111-4111-8111-111111111111';
    const missingColour = await postOnline(env, '/api/online/invitations/redeem', { token });
    const badColour = await postOnline(env, '/api/online/invitations/redeem', {
      token,
      colour: 'white',
    });
    const badToken = await postOnline(env, '/api/online/invitations/redeem', {
      token: 'nope',
      colour: 'w',
    });
    const redeemCalls = redeem.mock.calls.length;

    // Act
    const redeemed = await postOnline(env, '/api/online/invitations/redeem', {
      token,
      colour: 'random',
    });

    // Assert
    expect(missingColour.status).toBe(400);
    expect(badColour.status).toBe(400);
    expect(badToken.status).toBe(400);
    expect(redeemCalls).toBe(0);
    expect(redeemed.status).toBe(200);
    expect(redeem).toHaveBeenCalledWith('guest', token, 'random');
    const cancelled = await postOnline(env, '/api/online/invitations/cancel', { token });
    expect(cancelled.status).toBe(200);
    expect(revokeInvite).toHaveBeenCalledWith('guest', token);
  });

  it('upgrades the same-origin matchmaking socket with the player header', async () => {
    // Arrange
    const { env, fetch } = onlineEnv();
    const origin = 'https://ludus.test';
    const crossSite = await onlineApi(
      new Request(`${origin}/api/online/socket`, { headers: { Origin: 'https://evil.test' } }),
      env,
      'white',
    );

    // Act
    const incoming = new Request(`${origin}/api/online/socket`, {
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13',
      },
    });
    const response = await onlineApi(incoming, env, 'white');

    // Assert
    expect(crossSite?.status).toBe(403);
    expect(response?.status).toBe(426);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(incoming);
    const headers = new Headers((fetch.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Upgrade')).toBe('websocket');
    expect(headers.get('Sec-WebSocket-Key')).toBe('dGhlIHNhbXBsZSBub25jZQ==');
    expect(headers.get('X-Player')).toBe('white');
  });
});
function humanFixture(initial?: HumanGame) {
  const local = sqliteContext();
  const database = d1Database();
  const release = vi.fn().mockResolvedValue(undefined);
  const env = {
    DB: database.binding,
    MATCHMAKING: { getByName: () => ({ release }) },
  } as unknown as Env;
  const match = new HumanMatch(local.ctx, env);
  if (initial) {
    local.db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(initial));
  }
  return {
    ...local,
    database,
    release,
    match,
    saved: () =>
      JSON.parse(
        (local.db.prepare('SELECT data FROM state').get() as { data: string }).data,
      ) as HumanGame,
  };
}
function active() {
  return humanConnection(
    humanConnection(createHumanGame('game', assignment.players, '5+3', false, 0), 'w', true, 0),
    'b',
    true,
    0,
  );
}
describe('sQLite human match durability and authorisation', () => {
  it('rejects non-members for reads/actions/socket admission without exposing state', async () => {
    // Arrange
    const f = humanFixture(active());
    const read = await f.match.read('stranger');
    const action = await f.match.act('stranger', { type: 'resign', revision: 0 });
    const admission = await f.match.fetch(
      new Request('https://ludus.test', {
        headers: { Upgrade: 'websocket', 'X-Player': 'stranger' },
      }),
    );
    const saved = f.saved();
    let phraseError: unknown;
    try {
      await f.match.phrase('stranger', 'hello');
    } catch (error) {
      phraseError = error;
    }

    // Act
    const report = f.match.report('stranger', 'other');

    // Assert
    expect(read).toBeNull();
    expect(action).toEqual({ error: 'not_found' });
    expect(admission.status).toBe(404);
    expect(saved).toEqual(active());
    await expect(async () => {
      throw phraseError;
    }).rejects.toThrow('not_found');
    await expect(report).rejects.toThrow('not_found');
  });

  it('accepts a revision once during simultaneous moves and stale retry', async () => {
    // Arrange
    const f = humanFixture(active());
    const action = { type: 'move', from: 'e2', to: 'e4', revision: 0 };

    // Act
    const results = await Promise.all([f.match.act('white', action), f.match.act('white', action)]);

    // Assert
    expect(results.filter((result) => 'game' in result)).toHaveLength(1);
    expect(f.saved().moves).toEqual(['e4']);
    expect(f.saved().clocks.w).toBe(302_000);
  });

  it('retains a terminal retry alarm when D1 fails and applies finalisation exactly once', async () => {
    // Arrange
    const f = humanFixture(active());
    f.database.batch.mockRejectedValueOnce(new Error('D1 unavailable'));
    let failure: unknown;
    try {
      await f.match.act('white', { type: 'resign', revision: 0 });
    } catch (error) {
      failure = error;
    }
    const reason = f.saved().result?.reason;
    const deleteAlarmCalls = f.storage.deleteAlarm.mock.calls.length;
    await f.match.alarm();

    // Act
    await f.match.alarm();

    // Assert
    await expect(async () => {
      throw failure;
    }).rejects.toThrow('D1 unavailable');
    expect(reason).toBe('resignation');
    expect(deleteAlarmCalls).toBe(0);
    expect(f.database.db.prepare('SELECT * FROM online_results').all()).toEqual([
      { match_id: 'game', processed: 1 },
    ]);
    expect(f.database.db.prepare('SELECT count(*) AS count FROM online_matches').get()).toEqual({
      count: 1,
    });
    expect(recordActivity).toHaveBeenCalledWith(
      f.database.binding,
      expect.objectContaining({ gameId: 'game', players: ['white', 'black'] }),
    );
  });

  it('writes rating changes once under repeated result delivery and restores persisted state', async () => {
    // Arrange
    // Infrastructure test bypasses entry guard only in fixture. Production rated entry remains disabled.
    const game = { ...active(), rated: true };
    const f = humanFixture(game);
    await f.match.act('white', { type: 'resign', revision: 0 });
    const first = f.database.db.prepare('SELECT * FROM ratings ORDER BY user_id').all();

    // Act
    await Promise.all([f.match.alarm(), f.match.read('white'), f.match.read('black')]);

    // Assert
    expect(f.database.db.prepare('SELECT * FROM ratings ORDER BY user_id').all()).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first.every((row) => row.games === 1 && row.control === '5+3')).toBe(true);
    expect(
      f.database.db.prepare('SELECT count(*) AS count FROM ratings WHERE control=?').get('10+5'),
    ).toEqual({ count: 0 });
  });

  it('delivers preset IDs only to opposing sockets and keeps duplicate tabs connected', async () => {
    // Arrange
    const f = humanFixture(active());
    function socket(player: string) {
      return {
        player,
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        deserializeAttachment: () => ({ player }),
      };
    }
    const own = socket('white');
    const duplicate = socket('white');
    const opponent = socket('black');
    f.sockets.push(own, duplicate, opponent);
    await f.match.phrase('white', 'hello');
    const ownCalls = own.send.mock.calls.length;
    const duplicateCalls = duplicate.send.mock.calls.length;
    const opponentPayloads = opponent.send.mock.calls.map((call) => call[0]);
    await f.match.webSocketClose(own as unknown as WebSocket, 1000);
    const connectedWhileDuplicateOpen = f.saved().disconnected.w;
    own.readyState = 3;

    // Act
    await f.match.webSocketClose(duplicate as unknown as WebSocket, 1000);

    // Assert
    expect(ownCalls).toBe(0);
    expect(duplicateCalls).toBe(0);
    expect(opponentPayloads).toContain(JSON.stringify({ phrase: 'hello', from: 'w', at: 1000 }));
    expect(connectedWhileDuplicateOpen).toBe(false);
    expect(f.saved().disconnected.w).toBe(true);
    expect(f.saved().disconnected.b).toBe(false);
  });

  it('rate-limits validated preset IDs and deduplicates member reports', async () => {
    // Arrange
    const f = humanFixture(active());
    await f.match.phrase('white', 'hello');
    let limited: unknown;
    try {
      await f.match.phrase('white', 'goodGame');
    } catch (error) {
      limited = error;
    }
    vi.setSystemTime(4000);
    const allowed = await f.match.phrase('white', 'goodGame');
    await f.match.report('white', 'assistance');

    // Act
    await f.match.report('white', 'assistance');

    // Assert
    await expect(async () => {
      throw limited;
    }).rejects.toThrow('rate_limited');
    expect(allowed).toEqual({ ok: true });
    expect(f.database.db.prepare('SELECT count(*) AS count FROM match_reports').get()).toEqual({
      count: 1,
    });
  });
});

describe('human account erasure', () => {
  it('revokes the deleted seat and preserves opponent replay and cleanup retries', async () => {
    // Arrange
    const f = humanFixture(active());
    const socket = {
      player: 'white',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      deserializeAttachment: () => ({ player: 'white' }),
    };
    f.sockets.push(socket);
    f.database.db.prepare('INSERT INTO account_deletions VALUES(?)').run('white');
    await f.match.anonymise('white');
    const terminal = f.saved();
    const whiteRead = await f.match.read('white');
    const blackRead = await f.match.read('black');

    // Act
    await f.match.anonymise('white');

    // Assert
    expect(socket.close).toHaveBeenCalledWith(1008, 'Account deleted');
    expect(terminal.players.w).toBe('deleted:white');
    expect(terminal.result?.reason).toBe('resignation');
    expect(whiteRead).toBeNull();
    expect(blackRead?.game.moves).toEqual(terminal.moves);
    expect(f.saved()).toEqual(terminal);
    expect(f.database.db.prepare('SELECT white_id FROM online_matches').get()).toEqual({
      white_id: 'deleted:white',
    });
    expect(f.release).toHaveBeenCalledWith('game', ['deleted:white', 'black']);
  });

  it('refuses a late initialisation after a player deleted their account', async () => {
    // Arrange
    const f = humanFixture();
    f.database.db.prepare('INSERT INTO account_deletions VALUES(?)').run('white');

    // Act
    const initialising = f.match.initialise(assignment);

    // Assert
    await expect(initialising).rejects.toThrow('account_deleted');
    expect(f.database.db.prepare('SELECT count(*) AS count FROM online_matches').get()).toEqual({
      count: 0,
    });
  });
});
