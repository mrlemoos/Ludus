import type { HumanGame } from '../shared/human-game';
import { Chess } from 'chess.js';

export function predictMove(
  game: HumanGame,
  from: string,
  to: string,
  promotion?: string,
): HumanGame | null {
  if (game.result) {
    return null;
  }
  try {
    const chess = new Chess(game.fen);
    const move = chess.move({ from, to, promotion });
    return { ...game, moves: [...game.moves, move.san], fen: chess.fen(), drawOffer: null };
  } catch {
    return null;
  }
}

export function shouldApplySnapshot(
  latest: HumanGame | null,
  incoming: HumanGame,
  prediction: { baseRevision: number; moves: number } | null,
) {
  if (
    prediction &&
    incoming.revision === prediction.baseRevision &&
    incoming.moves.length < prediction.moves
  ) {
    return false;
  }
  if (
    latest &&
    latest.id === incoming.id &&
    (latest.revision > incoming.revision ||
      (latest.revision === incoming.revision && latest.updatedAt > incoming.updatedAt))
  ) {
    return false;
  }
  return true;
}
