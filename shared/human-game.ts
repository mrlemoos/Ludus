import type { Control } from './game';
import { Chess, type Color } from 'chess.js';

export const RATED_ENABLED = false;
export const RATED_GATE = 'Exact possible-mate timeout adjudication has not been certified.';
export type HumanReason =
  | 'checkmate'
  | 'stalemate'
  | 'material'
  | 'repetition'
  | 'fiftyMoves'
  | 'agreement'
  | 'resignation'
  | 'timeout'
  | 'abort';
export type HumanResult = { winner: Color | null; reason: HumanReason; at: number };
export type HumanGame = {
  id: string;
  players: Record<Color, string>;
  control: Control;
  rated: boolean;
  moves: string[];
  fen: string;
  clocks: Record<Color, number>;
  updatedAt: number;
  revision: number;
  result: HumanResult | null;
  disconnected: Record<Color, boolean>;
  pauseUsed: Record<Color, number>;
  drawOffer: Color | null;
};
export type HumanAction = { revision: number } & (
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'resign' | 'abort' | 'offerDraw' | 'acceptDraw' | 'declineDraw' | 'claimDraw' }
);
function other(colour: Color): Color  { return (colour === 'w' ? 'b' : 'w'); }
export function humanChess(game: Pick<HumanGame, 'moves'>) {
  const chess = new Chess();
  for (const move of game.moves) {chess.move(move);}
  return chess;
}
export function humanColour(game: HumanGame, player: string): Color {
  if (game.players.w === player) {return 'w';}
  if (game.players.b === player) {return 'b';}
  throw new Error('not_found');
}
export function createHumanGame(
  id: string,
  players: Record<Color, string>,
  control: Control,
  rated: boolean,
  now: number,
): HumanGame {
  if (!players.w || !players.b || players.w === players.b || !['5+3', '10+5'].includes(control))
    {throw new Error('invalid_players');}
  if (rated && !RATED_ENABLED) {throw new Error('rated_unavailable');}
  const time = control === '5+3' ? 300_000 : 600_000;
  return {
    id,
    players,
    control,
    rated,
    moves: [],
    fen: new Chess().fen(),
    clocks: { w: time, b: time },
    updatedAt: now,
    revision: 0,
    result: null,
    disconnected: { w: true, b: true },
    pauseUsed: { w: 0, b: 0 },
    drawOffer: null,
  };
}
export function humanTiming(game: HumanGame, now: number) {
  const elapsed = Math.max(0, now - game.updatedAt),
    clocks = { ...game.clocks },
    pauseUsed = { ...game.pauseUsed };
  const allowance = {
    w: game.disconnected.w ? Math.max(0, 60_000 - pauseUsed.w) : 0,
    b: game.disconnected.b ? Math.max(0, 60_000 - pauseUsed.b) : 0,
  };
  const pause = game.result ? 0 : Math.min(elapsed, Math.max(allowance.w, allowance.b));
  if (!game.result) {
    for (const colour of ['w', 'b'] as const)
      {if (game.disconnected[colour]) pauseUsed[colour] += Math.min(elapsed, allowance[colour]);}
    const turn = game.fen.split(' ')[1] as Color;
    clocks[turn] = Math.max(0, clocks[turn] - elapsed + pause);
  }
  return {
    clocks,
    pauseUsed,
    pauseRemaining: Math.max(0, Math.max(allowance.w, allowance.b) - elapsed),
  };
}
/** Exact for these material classes; unknown includes blocked-pawn and forced-line dead positions. */
export function possibleMate(chess: Chess, colour: Color): boolean | 'unknown' {
  const pieces = chess
    .board()
    .flat()
    .filter((piece) => piece !== null);
  const own = pieces.filter((piece) => piece.color === colour && piece.type !== 'k');
  const enemy = pieces.filter((piece) => piece.color !== colour && piece.type !== 'k');
  if (!own.length) {return false;}
  if (own.length === 1 && ['b', 'n'].includes(own[0].type) && !enemy.length) {return false;}
  const nonKings = pieces.filter((piece) => piece.type !== 'k');
  if (nonKings.every((piece) => piece.type === 'b')) {
    const squares = nonKings.map(
      (piece) => (piece.square.charCodeAt(0) + Number(piece.square[1])) % 2,
    );
    if (squares.every((square) => square === squares[0])) {return false;}
  }
  if (chess.isCheckmate()) {return chess.turn() !== colour;}
  return 'unknown';
}
export function settleHuman(game: HumanGame, now: number): HumanGame {
  if (game.result) {return game;}
  const timing = humanTiming(game, now),
    turn = game.fen.split(' ')[1] as Color;
  if (timing.clocks[turn] > 0) {return game;}
  const winner = other(turn);
  return {
    ...game,
    clocks: timing.clocks,
    pauseUsed: timing.pauseUsed,
    updatedAt: now,
    revision: game.revision + 1,
    drawOffer: null,
    result: {
      winner: possibleMate(humanChess(game), winner) === false ? null : winner,
      reason: 'timeout',
      at: game.updatedAt + game.clocks[turn] + humanTiming(game, game.updatedAt).pauseRemaining,
    },
  };
}
export function humanConnection(
  game: HumanGame,
  colour: Color,
  connected: boolean,
  now: number,
): HumanGame {
  const current = settleHuman(game, now);
  if (current.result || current.disconnected[colour] === !connected) {return current;}
  const { clocks, pauseUsed } = humanTiming(current, now);
  return {
    ...current,
    clocks,
    pauseUsed,
    updatedAt: now,
    disconnected: { ...current.disconnected, [colour]: !connected },
  };
}
export function positionCount(chess: Chess) {
  function key(fen: string) { return fen.split(' ').slice(0, 4).join(' '); }
  const target = key(chess.fen()),
    replay = new Chess();
  let count = key(replay.fen()) === target ? 1 : 0;
  for (const move of chess.history()) {
    replay.move(move);
    if (key(replay.fen()) === target) {count++;}
  }
  return count;
}
export function humanDrawClaim(chess: Chess): HumanReason | null {
  if (chess.isThreefoldRepetition()) {return 'repetition';}
  if (chess.isDrawByFiftyMoves()) {return 'fiftyMoves';}
  return null;
}
export function humanOutcome(chess: Chess): { reason: HumanReason; winner: Color | null } | null {
  if (chess.isCheckmate()) {return { reason: 'checkmate', winner: other(chess.turn()) };}
  if (chess.isStalemate()) {return { reason: 'stalemate', winner: null };}
  if (chess.isInsufficientMaterial()) {return { reason: 'material', winner: null };}
  if (positionCount(chess) >= 5) {return { reason: 'repetition', winner: null };}
  if (Number(chess.fen().split(' ')[4]) >= 150) {return { reason: 'fiftyMoves', winner: null };}
  return null;
}
export function applyHumanAction(
  game: HumanGame,
  player: string,
  action: HumanAction,
  now: number,
): HumanGame {
  const colour = humanColour(game, player),
    current = settleHuman(game, now);
  if (current.result) {return current;}
  if (action.revision !== current.revision) {throw new Error('stale');}
  const timing = humanTiming(current, now);
  const next = {
    ...current,
    clocks: timing.clocks,
    pauseUsed: timing.pauseUsed,
    updatedAt: now,
    revision: current.revision + 1,
  };
  function finish(reason: HumanReason, winner: Color | null = null): HumanGame  { return ({
    ...next,
    drawOffer: null,
    result: { winner, reason, at: now },
  }); }
  if (action.type === 'resign') {return finish('resignation', other(colour));}
  if (action.type === 'abort') {
    if (current.moves.length >= 2) {throw new Error('cannot_abort');}
    return finish('abort');
  }
  if (action.type === 'offerDraw') {
    if (current.moves.length < 2 || current.drawOffer) {throw new Error('cannot_offer');}
    return { ...next, drawOffer: colour };
  }
  if (action.type === 'acceptDraw') {
    if (current.drawOffer !== other(colour)) {throw new Error('no_offer');}
    return finish('agreement');
  }
  if (action.type === 'declineDraw') {
    if (current.drawOffer !== other(colour)) {throw new Error('no_offer');}
    return { ...next, drawOffer: null };
  }
  if (timing.pauseRemaining > 0) {throw new Error('disconnected');}
  const chess = humanChess(current);
  if (chess.turn() !== colour) {throw new Error('out_of_turn');}
  if (action.type === 'claimDraw') {
    const reason = humanDrawClaim(chess);
    if (reason) {return finish(reason);}
    throw new Error('cannot_claim');
  }
  if (action.type !== 'move') {throw new Error('invalid_action');}
  const move = chess.move({ from: action.from, to: action.to, promotion: action.promotion });
  next.clocks[colour] += current.control === '5+3' ? 3000 : 5000;
  const moved: HumanGame = {
    ...next,
    moves: [...current.moves, move.san],
    fen: chess.fen(),
    drawOffer: null,
  };
  const outcome = humanOutcome(chess);
  return outcome ? { ...moved, result: { ...outcome, at: now } } : moved;
}
export function parseHumanAction(input: unknown): HumanAction | null {
  if (
    !input ||
    typeof input !== 'object' ||
    !('revision' in input) ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 0 ||
    !('type' in input)
  )
    {return null;}
  if (
    ['resign', 'abort', 'offerDraw', 'acceptDraw', 'declineDraw', 'claimDraw'].includes(
      String(input.type),
    )
  )
    {return {
      type: input.type as Exclude<HumanAction['type'], 'move'>,
      revision: Number(input.revision),
    };}
  if (
    input.type !== 'move' ||
    !('from' in input) ||
    !('to' in input) ||
    !/^[a-h][1-8]$/.test(String(input.from)) ||
    !/^[a-h][1-8]$/.test(String(input.to))
  )
    {return null;}
  const promotion = 'promotion' in input ? input.promotion : undefined;
  if (promotion !== undefined && (typeof promotion !== 'string' || !/^[qrbn]$/.test(promotion)))
    {return null;}
  return {
    type: 'move',
    from: String(input.from),
    to: String(input.to),
    revision: Number(input.revision),
    ...(promotion ? { promotion } : {}),
  };
}
export const phraseIds = ['hello', 'goodLuck', 'wellPlayed', 'thanks', 'goodGame'] as const;
export type PhraseId = (typeof phraseIds)[number];
export const reportCategories = ['assistance', 'presetSpam', 'other'] as const;
