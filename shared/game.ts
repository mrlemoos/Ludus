import { Chess, type Color } from 'chess.js';

export type Control = '5+3' | '10+5';
export type Difficulty = 1 | 2 | 3 | 4;
export type Result = {
  winner: Color | null;
  reason:
    | 'checkmate'
    | 'stalemate'
    | 'material'
    | 'repetition'
    | 'fiftyMoves'
    | 'resignation'
    | 'timeout'
    | 'fivefold'
    | 'seventyFiveMoves';
};
export type Game = {
  id: string;
  owner: string;
  control: Control;
  difficulty: Difficulty;
  colour: Color;
  moves: string[];
  fen: string;
  clocks: Record<Color, number>;
  updatedAt: number;
  revision: number;
  result: Result | null;
  pauseStarted: number | null;
  pauseUsed: number;
};
export type Action =
  | { type: 'move'; from: string; to: string; promotion?: string; revision: number }
  | { type: 'resign' | 'claimDraw'; revision: number };
export function createGame(
  id: string,
  owner: string,
  control: Control,
  difficulty: Difficulty,
  colour: Color,
  now: number,
): Game {
  const time = control === '5+3' ? 300_000 : 600_000;
  return {
    id,
    owner,
    control,
    difficulty,
    colour,
    moves: [],
    fen: new Chess().fen(),
    clocks: { w: time, b: time },
    updatedAt: now,
    revision: 0,
    result: null,
    pauseStarted: now,
    pauseUsed: 0,
  };
}
export function chessFrom(game: Game) {
  const chess = new Chess();
  for (const move of game.moves) chess.move(move);
  return chess;
}
export function remaining(game: Game, now: number): Record<Color, number> {
  const clocks = { ...game.clocks };
  if (game.result) return clocks;
  const paused =
    game.pauseStarted === null
      ? 0
      : Math.min(Math.max(0, now - game.pauseStarted), 60_000 - game.pauseUsed);
  const turn = game.fen.split(' ')[1] as Color;
  clocks[turn] = Math.max(0, clocks[turn] - Math.max(0, now - game.updatedAt - paused));
  return clocks;
}
export function settle(game: Game, now: number): Game {
  if (game.result) return game;
  const clocks = remaining(game, now);
  const turn = game.fen.split(' ')[1] as Color;
  if (clocks[turn] > 0) return game;
  const chess = chessFrom(game);
  const other = turn === 'w' ? 'b' : 'w';
  // shortcut: conservative material check for casual computer games; ratified timeout policy gates rated play.
  const material = chess
    .board()
    .flat()
    .filter((p) => p?.color === other && p.type !== 'k');
  const cannotMate =
    material.length === 0 ||
    (material.length === 1 &&
      ['b', 'n'].includes(material[0]!.type) &&
      chess
        .board()
        .flat()
        .filter((p) => p?.color === turn).length === 1);
  return {
    ...game,
    clocks,
    result: { winner: cannotMate ? null : other, reason: 'timeout' },
    revision: game.revision + 1,
    updatedAt: now,
  };
}
export function connection(game: Game, connected: boolean, now: number): Game {
  game = settle(game, now);
  if (
    game.result ||
    (connected && game.pauseStarted === null) ||
    (!connected && game.pauseStarted !== null)
  )
    return game;
  if (connected) {
    const paused = Math.min(now - game.pauseStarted!, 60_000 - game.pauseUsed);
    return {
      ...game,
      clocks: remaining(game, now),
      updatedAt: now,
      pauseStarted: null,
      pauseUsed: game.pauseUsed + paused,
    };
  }
  return { ...game, clocks: remaining(game, now), updatedAt: now, pauseStarted: now };
}
export function applyAction(game: Game, action: Action, now: number): Game {
  const current = settle(game, now);
  if (current.result) throw new Error('finished');
  if (action.revision !== current.revision) throw new Error('stale');
  if (current.pauseStarted !== null) throw new Error('disconnected');
  if (action.type === 'resign')
    return {
      ...current,
      clocks: remaining(current, now),
      updatedAt: now,
      revision: current.revision + 1,
      result: { winner: current.colour === 'w' ? 'b' : 'w', reason: 'resignation' },
    };
  const chess = chessFrom(current);
  const turn = chess.turn();
  if (action.type === 'claimDraw') {
    if (
      chess.turn() !== current.colour ||
      (!chess.isThreefoldRepetition() && !chess.isDrawByFiftyMoves())
    )
      throw new Error('draw_not_claimable');
    return {
      ...current,
      clocks: remaining(current, now),
      updatedAt: now,
      revision: current.revision + 1,
      result: { winner: null, reason: chess.isThreefoldRepetition() ? 'repetition' : 'fiftyMoves' },
    };
  }
  if (action.type !== 'move') throw new Error('invalid');
  const move = chess.move({ from: action.from, to: action.to, promotion: action.promotion });
  if (!move) throw new Error('illegal');
  const clocks = remaining(current, now);
  clocks[turn] += current.control === '5+3' ? 3000 : 5000;
  let result: Result | null = null;
  if (chess.isCheckmate()) result = { winner: turn, reason: 'checkmate' };
  else if (chess.isStalemate()) result = { winner: null, reason: 'stalemate' };
  else if (chess.isInsufficientMaterial()) result = { winner: null, reason: 'material' };
  else if (positionOccurrences(chess) >= 5) result = { winner: null, reason: 'fivefold' };
  else if (Number(chess.fen().split(' ')[4]) >= 150)
    result = { winner: null, reason: 'seventyFiveMoves' };
  return {
    ...current,
    moves: [...current.moves, move.san],
    fen: chess.fen(),
    clocks,
    updatedAt: now,
    result,
    revision: current.revision + 1,
  };
}
export function parseAction(input: unknown): Action | null {
  if (
    !input ||
    typeof input !== 'object' ||
    !('revision' in input) ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 0 ||
    !('type' in input)
  )
    return null;
  if (input.type === 'resign' || input.type === 'claimDraw')
    return { type: input.type, revision: Number(input.revision) };
  if (
    input.type !== 'move' ||
    !('from' in input) ||
    !('to' in input) ||
    typeof input.from !== 'string' ||
    typeof input.to !== 'string' ||
    !/^[a-h][1-8]$/.test(input.from) ||
    !/^[a-h][1-8]$/.test(input.to)
  )
    return null;
  const promotion = 'promotion' in input ? input.promotion : undefined;
  if (promotion !== undefined && (typeof promotion !== 'string' || !/^[qrbn]$/.test(promotion)))
    return null;
  return {
    type: 'move',
    from: input.from,
    to: input.to,
    promotion,
    revision: Number(input.revision),
  };
}

export function positionOccurrences(chess: Chess): number {
  const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const target = key(chess.fen()),
    history = chess.history({ verbose: true });
  return (
    Number(key(new Chess().fen()) === target) +
    history.filter((move) => key(move.after) === target).length
  );
}
