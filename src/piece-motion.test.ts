import { pieceMotion } from './piece-motion';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

describe('piece motion', () => {
  it('slides a move from its original square', () => {
    // Arrange
    const chess = new Chess();
    const before = chess.fen();
    chess.move('e4');

    // Act
    const motion = pieceMotion(before, chess.fen(), ['e2', 'e4']);

    // Assert
    expect(motion).toEqual({ e4: [0, 0, 2] });
  });

  it('does not animate when the position is unchanged', () => {
    // Arrange
    const chess = new Chess();
    chess.move('e4');

    // Act
    const motion = pieceMotion(chess.fen(), chess.fen(), ['e2', 'e4']);

    // Assert
    expect(motion).toEqual({});
  });

  it('does not animate a move that was not played', () => {
    // Arrange
    const chess = new Chess();
    const before = chess.fen();
    chess.move('e4');

    // Act
    const motion = pieceMotion(before, chess.fen(), ['a2', 'a4']);

    // Assert
    expect(motion).toEqual({});
  });

  it('moves king and rook together when castling', () => {
    // Arrange
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const before = chess.fen();
    chess.move('O-O');

    // Act
    const motion = pieceMotion(before, chess.fen(), ['e1', 'g1']);

    // Assert
    expect(motion).toEqual({
      g1: [-2, 0, 0],
      f1: [2, 0, 0],
    });
  });

  it('animates captures and promotions', () => {
    // Arrange
    const chess = new Chess('1r5k/P7/8/8/8/8/8/7K w - - 0 1');
    const before = chess.fen();
    chess.move('axb8=N');

    // Act
    const motion = pieceMotion(before, chess.fen(), ['a7', 'b8']);

    // Assert
    expect(motion).toEqual({ b8: [-1, 0, 1] });
  });
});
