import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { pieceMotion } from '../../src/piece-motion';

describe('piece motion', () => {
  it('slides a move from its original square without animating initial positions', () => {
    const chess = new Chess();
    const before = chess.fen();
    chess.move('e4');
    expect(pieceMotion(before, chess.fen(), ['e2', 'e4'])).toEqual({ e4: [0, 0, 2] });
    expect(pieceMotion(chess.fen(), chess.fen(), ['e2', 'e4'])).toEqual({});
    expect(pieceMotion(before, chess.fen(), ['a2', 'a4'])).toEqual({});
  });

  it('moves king and rook together when castling', () => {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const before = chess.fen();
    chess.move('O-O');
    expect(pieceMotion(before, chess.fen(), ['e1', 'g1'])).toEqual({ g1: [-2, 0, 0], f1: [2, 0, 0] });
  });

  it('animates captures and promotions', () => {
    const chess = new Chess('1r5k/P7/8/8/8/8/8/7K w - - 0 1');
    const before = chess.fen();
    chess.move('axb8=N');
    expect(pieceMotion(before, chess.fen(), ['a7', 'b8'])).toEqual({ b8: [-1, 0, 1] });
  });
});
