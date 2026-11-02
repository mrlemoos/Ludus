import { applyHumanAction, createHumanGame, humanColour, humanConnection, humanTiming, parseHumanAction, phraseIds, reportCategories, settleHuman } from '../shared/human-game';
import type { HumanGame, PhraseId } from '../shared/human-game';
import type { Assignment } from '../shared/matchmaking';
import { initialRating, rateMatch } from '../shared/rating';
import type { Rating } from '../shared/rating';
import { recordActivity } from './accounts';
import { DurableObject } from 'cloudflare:workers';

type RatingRow = Rating & { user_id: string };
export class HumanMatch extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS phrases (user_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)',
    );
  }
  private load(): HumanGame | null {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM state WHERE id=1')
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  private save(game: HumanGame) {
    this.ctx.storage.sql.exec(
      'INSERT INTO state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      JSON.stringify(game),
    );
  }
  private async finalise(game: HumanGame) {
    if (!game.result) {return;}
    await this.env.DB.prepare(
      'INSERT INTO online_matches(id,white_id,black_id,control,rated,result,finished_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET result=excluded.result,finished_at=excluded.finished_at WHERE online_matches.result IS NULL',
    )
      .bind(
        game.id,
        game.players.w,
        game.players.b,
        game.control,
        game.rated ? 1 : 0,
        JSON.stringify(game.result),
        game.result.at,
      )
      .run();
    const statements = [
      this.env.DB.prepare(
        'INSERT INTO online_results(match_id,processed) VALUES(?,0) ON CONFLICT DO NOTHING',
      ).bind(game.id),
    ];
    if (game.rated && game.result.reason !== 'abort') {
      const rows = await this.env.DB.prepare(
        'SELECT user_id,rating,deviation,volatility,games FROM ratings WHERE control=? AND user_id IN (?,?)',
      )
        .bind(game.control, game.players.w, game.players.b)
        .all<RatingRow>();
      function before(id: string) { return rows.results.find((row) => row.user_id === id) ?? initialRating(); }
      const after = rateMatch(before(game.players.w), before(game.players.b), game.result.winner);
      for (const colour of ['w', 'b'] as const) {
        const rating = after[colour];
        statements.push(
          this.env.DB.prepare(
            'INSERT INTO ratings(user_id,control,rating,deviation,volatility,games) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM online_results WHERE match_id=? AND processed=0) ON CONFLICT(user_id,control) DO UPDATE SET rating=excluded.rating,deviation=excluded.deviation,volatility=excluded.volatility,games=excluded.games',
          ).bind(
            game.players[colour],
            game.control,
            rating.rating,
            rating.deviation,
            rating.volatility,
            rating.games,
            game.id,
          ),
        );
      }
    }
    statements.push(
      this.env.DB.prepare(
        'UPDATE online_results SET processed=1 WHERE match_id=? AND processed=0',
      ).bind(game.id),
    );
    await this.env.DB.batch(statements);
    await recordActivity(this.env.DB, {
      gameId: game.id,
      players: Object.values(game.players),
      reason: game.result.reason,
      moves: game.moves.length,
      completedAt: game.result.at,
    });
    await this.env.MATCHMAKING.getByName('beta').release(game.id, Object.values(game.players));
  }
  private async publish(game: HumanGame) {
    this.save(game);
    const snapshot = JSON.stringify({ game, serverNow: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(snapshot);
      } catch {
        socket.close(1011, 'Reconnect');
      }
    }
    if (game.result) {
      // Persist a retry alarm before D1 I/O; failures cannot lose result delivery.
      await this.ctx.storage.setAlarm(Date.now() + 5000);
      await this.finalise(game);
      await this.ctx.storage.deleteAlarm();
    } else {
      const current = this.load();
      if (!current || current.result) {return;}
      const turn = current.fen.split(' ')[1] as 'w' | 'b';
      const paused = humanTiming(current, current.updatedAt).pauseRemaining;
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, current.updatedAt + current.clocks[turn] + paused),
      );
    }
  }
  private async revoked(player: string) {
    return !!(await this.env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?')
      .bind(player)
      .first());
  }
  async anonymise(player: string) {
    const game = this.load();
    if (!game) {return;}
    const marker = `deleted:${player}`;
    const colour = (['w', 'b'] as const).find(
      (side) => game.players[side] === player || game.players[side] === marker,
    );
    if (!colour) {return;}
    const other = colour === 'w' ? 'b' : 'w';
    const result = game.result ?? { winner: other, reason: 'resignation' as const, at: Date.now() };
    const next: HumanGame = {
      ...game,
      players: { ...game.players, [colour]: marker },
      result,
      revision: game.result ? game.revision : game.revision + 1,
    };
    this.save(next);
    for (const socket of this.ctx.getWebSockets(player)) {socket.close(1008, 'Account deleted');}
    await this.ctx.storage.setAlarm(Date.now() + 5000);
    await this.env.DB.prepare(
      'UPDATE online_matches SET white_id=CASE WHEN white_id=? THEN ? ELSE white_id END,black_id=CASE WHEN black_id=? THEN ? ELSE black_id END WHERE id=?',
    )
      .bind(player, marker, player, marker, game.id)
      .run();
    await this.publish(this.load()!);
  }
  async initialise(assignment: Assignment) {
    if ((await this.revoked(assignment.players.w)) || (await this.revoked(assignment.players.b)))
      {throw new Error('account_deleted');}
    const existing = this.load();
    if (existing) {
      if (
        existing.players.w !== assignment.players.w ||
        existing.players.b !== assignment.players.b
      )
        {throw new Error('conflict');}
      return existing;
    }
    const game = createHumanGame(
      assignment.id,
      assignment.players,
      assignment.control,
      assignment.rated,
      Date.now(),
    );
    this.save(game);
    await this.env.DB.prepare(
      'INSERT INTO online_matches(id,white_id,black_id,control,rated) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id IN (?,?)) ON CONFLICT DO NOTHING',
    )
      .bind(
        game.id,
        game.players.w,
        game.players.b,
        game.control,
        Number(game.rated),
        game.players.w,
        game.players.b,
      )
      .run();
    for (const player of [assignment.players.w, assignment.players.b])
      {if (await this.revoked(player)) {
        await this.anonymise(player);
        throw new Error('account_deleted');
      }}
    const current = this.load()!;
    await this.publish(current);
    return current;
  }
  async read(player: string) {
    if (await this.revoked(player)) {
      await this.anonymise(player);
      return null;
    }
    const game = this.load();
    if (!game) {return null;}
    try {
      humanColour(game, player);
    } catch {
      return null;
    }
    const current = settleHuman(game, Date.now());
    if (current !== game || current.result) {await this.publish(current);}
    return { game: current, serverNow: Date.now() };
  }
  async act(player: string, input: unknown) {
    if (await this.revoked(player)) {
      await this.anonymise(player);
      return { error: 'not_found' };
    }
    const game = this.load();
    if (!game) {return { error: 'not_found' };}
    const action = parseHumanAction(input);
    if (!action) {return { error: 'invalid' };}
    let next: HumanGame;
    try {
      next = applyHumanAction(game, player, action, Date.now());
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'invalid' };
    }
    await this.publish(next);
    return { game: next, serverNow: Date.now() };
  }
  async phrase(player: string, phrase: PhraseId) {
    if (await this.revoked(player)) {throw new Error('not_found');}
    const game = this.load();
    if (!game) {throw new Error('not_found');}
    const colour = humanColour(game, player);
    if (!phraseIds.includes(phrase)) {throw new Error('invalid_phrase');}
    const now = Date.now();
      const last = this.ctx.storage.sql
        .exec<{ sent_at: number }>('SELECT sent_at FROM phrases WHERE user_id=?', player)
        .toArray()[0];
    if (last && now - last.sent_at < 3000) {throw new Error('rate_limited');}
    this.ctx.storage.sql.exec(
      'INSERT INTO phrases VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET sent_at=excluded.sent_at',
      player,
      now,
    );
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { player?: string } | null;
      if (attachment?.player !== player)
        {socket.send(JSON.stringify({ phrase, from: colour, at: now }));}
    }
    return { ok: true };
  }
  async report(player: string, category: (typeof reportCategories)[number]) {
    if (await this.revoked(player)) {throw new Error('not_found');}
    const game = this.load();
    if (!game) {throw new Error('not_found');}
    const colour = humanColour(game, player);
    if (!reportCategories.includes(category)) {throw new Error('invalid_report');}
    await this.env.DB.prepare(
      'INSERT INTO match_reports(id,match_id,reporter_id,opponent_id,category,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
    )
      .bind(
        crypto.randomUUID(),
        game.id,
        player,
        game.players[colour === 'w' ? 'b' : 'w'],
        category,
        Date.now(),
      )
      .run();
    return { ok: true };
  }
  async fetch(request: Request) {
    const identity = request.headers.get('X-Player');
    if (!identity || (await this.revoked(identity))) {
      if (identity) {await this.anonymise(identity);}
      return new Response(null, { status: 404 });
    }
    const game = this.load();
      const player = request.headers.get('X-Player');
    if (!game || !player) {return new Response(null, { status: 404 });}
    let colour: 'w' | 'b';
    try {
      colour = humanColour(game, player);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      {return new Response(null, { status: 426 });}
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [player]);
    pair[1].serializeAttachment({ player });
    await this.publish(humanConnection(game, colour, true, Date.now()));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketClose(socket: WebSocket, code: number) {
    const player = (socket.deserializeAttachment() as { player?: string } | null)?.player;
    socket.close(code, 'Closed');
    if (
      !player ||
      this.ctx
        .getWebSockets(player)
        .some((other) => other !== socket && other.readyState === WebSocket.OPEN)
    )
      {return;}
    const game = this.load();
    if (game)
      {await this.publish(humanConnection(game, humanColour(game, player), false, Date.now()));}
  }
  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket, 1011);
  }
  async alarm() {
    const game = this.load();
    if (game) {await this.publish(settleHuman(game, Date.now()));}
  }
}
