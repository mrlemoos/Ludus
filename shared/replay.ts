import type { Game } from './game';
import { Chess } from 'chess.js';

export type Replay = { moves: string[]; ply: number; branchAt: number | null };
type SavedGame = Pick<Game, 'moves' | 'result'>;

function finished(game: SavedGame) {
  if (!game.result) throw new Error('unfinished');
}
export function savedReplay(game: SavedGame, ply = game.moves.length): Replay {
  finished(game);
  if (!Number.isInteger(ply) || ply < 0 || ply > game.moves.length) throw new Error('invalid_ply');
  return { moves: [...game.moves], ply, branchAt: null };
}
export function replayPosition(game: SavedGame, replay: Replay): Chess {
  finished(game);
  const chess = new Chess();
  for (const move of replay.moves.slice(0, replay.ply)) chess.move(move);
  return chess;
}
export function replayMove(
  game: SavedGame,
  replay: Replay,
  move: { from: string; to: string; promotion?: string },
): Replay {
  const chess = replayPosition(game, replay);
  const played = chess.move(move);
  return {
    moves: [...replay.moves.slice(0, replay.ply), played.san],
    ply: replay.ply + 1,
    branchAt: Math.min(replay.branchAt ?? replay.ply, replay.ply),
  };
}
export function stepReplay(replay: Replay, delta: number): Replay {
  return { ...replay, ply: Math.max(0, Math.min(replay.moves.length, replay.ply + delta)) };
}
