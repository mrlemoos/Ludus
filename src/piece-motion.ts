import { Chess, type Square } from 'chess.js';

export function pieceMotion(
  previousFen: string,
  fen: string,
  lastMove: string[],
): Partial<Record<Square, [number, number, number]>> {
  if (previousFen === fen || lastMove.length !== 2) return {};
  const chess = new Chess(previousFen);
  const move = chess
    .moves({ verbose: true })
    .find(
      (move) =>
        move.from === lastMove[0] &&
        move.to === lastMove[1] &&
        (!move.promotion || move.promotion === new Chess(fen).get(move.to)?.type),
    );
  if (!move) return {};
  chess.move(move);
  if (chess.fen() !== fen) return {};
  const offset = (from: string, to: string): [number, number, number] => [
    from.charCodeAt(0) - to.charCodeAt(0),
    0,
    Number(to[1]) - Number(from[1]),
  ];
  const motion: Partial<Record<Square, [number, number, number]>> = {
    [move.to]: offset(move.from, move.to),
  };
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const rank = move.to[1];
    const from = `${move.isKingsideCastle() ? 'h' : 'a'}${rank}`;
    const to = `${move.isKingsideCastle() ? 'f' : 'd'}${rank}` as Square;
    motion[to] = offset(from, to);
  }
  return motion;
}
