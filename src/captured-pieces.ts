import type { Chess, Color, PieceSymbol } from 'chess.js';

export type CapturedPiece = { type: PieceSymbol; colour: Color };
export function capturedPieces(chess: Chess): CapturedPiece[] {
  return chess.history({ verbose: true }).flatMap((move) => move.captured ? [{ type: move.captured, colour: move.color === 'w' ? 'b' : 'w' }] : []);
}
