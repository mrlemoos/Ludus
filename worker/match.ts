import { applyAction, connection, createGame, parseAction, settle } from '../shared/game';
import type { Control, Difficulty, Game } from '../shared/game';
import { recordActivity } from './accounts';
import { matches } from './schema';
import { DurableObject } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export class Match extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)',
    );
  }
  private load(): Game | null {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM state WHERE id = 1')
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  private save(game: Game) {
    this.ctx.storage.sql.exec(
      'INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      JSON.stringify(game),
    );
  }
  private async publish(game: Game) {
    this.save(game);
    const message = JSON.stringify({ game, serverNow: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, 'Reconnect');
      }
    }
    if (game.result) {
      await this.ctx.storage.setAlarm(Date.now() + 5000);
      await drizzle(this.env.DB)
        .update(matches)
        .set({ result: JSON.stringify(game.result), finishedAt: game.updatedAt })
        .where(eq(matches.id, game.id));
      await recordActivity(this.env.DB, {
        gameId: game.id,
        players: [game.owner],
        reason: game.result.reason,
        moves: game.moves.length,
        completedAt: game.updatedAt,
      });
      await this.env.MATCHMAKING.getByName('beta').releaseComputer(game.owner, game.id);
      await this.ctx.storage.deleteAlarm();
    } else {
      const turn = game.fen.split(' ')[1] as 'w' | 'b';
      const pause = game.pauseStarted === null ? 0 : 60_000 - game.pauseUsed;
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, game.updatedAt + game.clocks[turn] + pause),
      );
    }
  }
  private async deleted(owner: string) {
    return !!(await this.env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?')
      .bind(owner)
      .first());
  }
  async initialise(
    id: string,
    owner: string,
    control: Control,
    difficulty: Difficulty,
    colour: 'w' | 'b',
  ) {
    if (await this.deleted(owner)) {
      await this.anonymise(owner);
      throw new Error('account_deleted');
    }
    const existing = this.load();
    if (existing) {return existing;}
    const game = createGame(id, owner, control, difficulty, colour, Date.now());
    await this.publish(game);
    if (await this.deleted(owner)) {
      await this.anonymise(owner);
      throw new Error('account_deleted');
    }
    return this.load()!;
  }
  async read(owner: string) {
    if (await this.deleted(owner)) {
      await this.anonymise(owner);
      return null;
    }
    const game = this.load();
    if (!game || game.owner !== owner) {return null;}
    const current = settle(game, Date.now());
    if (current !== game || current.result) {await this.publish(current);}
    return { game: current, serverNow: Date.now() };
  }
  async act(owner: string, input: unknown) {
    if (await this.deleted(owner)) {
      await this.anonymise(owner);
      return { error: 'not_found' };
    }
    const game = this.load();
    if (!game || game.owner !== owner) {return { error: 'not_found' };}
    const action = parseAction(input);
    if (!action) {return { error: 'invalid' };}
    const current = settle(game, Date.now());
    if (current.result) {
      await this.publish(current);
      return { game: current, serverNow: Date.now() };
    }
    let next: Game;
    try {
      next = applyAction(current, action, Date.now());
    } catch {
      return { error: 'invalid_action', game: current, serverNow: Date.now() };
    }
    await this.publish(next);
    return { game: next, serverNow: Date.now() };
  }
  async fetch(request: Request) {
    let game = this.load();
    if (!game || request.headers.get('X-Player') !== game.owner)
      {return new Response(null, { status: 404 });}
    if (await this.deleted(game.owner)) {
      await this.anonymise(game.owner);
      return new Response(null, { status: 404 });
    }
    game = this.load();
    if (!game || request.headers.get('X-Player') !== game.owner)
      {return new Response(null, { status: 404 });}
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      {return new Response(null, { status: 426 });}
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const next = connection(game, true, Date.now());
    await this.publish(next);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async anonymise(owner: string) {
    const game = this.load();
    if (!game || (game.owner !== owner && game.owner !== 'deleted')) {return;}
    const result = game.result ?? {
      winner: game.colour === 'w' ? ('b' as const) : ('w' as const),
      reason: 'resignation' as const,
    };
    this.save({ ...game, owner: 'deleted', result });
    for (const socket of this.ctx.getWebSockets()) {socket.close(1008, 'Account deleted');}
    await this.env.MATCHMAKING.getByName('beta').releaseComputer(owner, game.id);
    await this.ctx.storage.deleteAlarm();
    await drizzle(this.env.DB)
      .update(matches)
      .set({ result: JSON.stringify(result) })
      .where(eq(matches.id, game.id));
  }
  async webSocketClose(socket: WebSocket, code: number) {
    socket.close(code, 'Closed');
    if (
      this.ctx
        .getWebSockets()
        .some((other) => other !== socket && other.readyState === WebSocket.OPEN)
    )
      {return;}
    const game = this.load();
    if (game) {await this.publish(connection(game, false, Date.now()));}
  }
  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket, 1011);
  }
  async alarm() {
    const game = this.load();
    if (game) {await this.publish(settle(game, Date.now()));}
  }
}
