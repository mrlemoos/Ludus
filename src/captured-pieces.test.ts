import { capturedPieces } from './captured-pieces';
import { Chess } from 'chess.js';
import { expect, it } from 'vitest';

function play(moves: string[]) {
  const chess = new Chess();
  for (const move of moves) {
    chess.move(move);
  }
  return chess;
}

it('retains the identity of pieces captured in the main line', () => {
  // Arrange
  const chess = play(['e4', 'd5', 'exd5', 'Qxd5']);

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([
    { type: 'p', colour: 'b' },
    { type: 'p', colour: 'w' },
  ]);
});

it('follows an undone capture during replay', () => {
  // Arrange
  const chess = play(['e4', 'd5', 'exd5', 'Qxd5']);
  chess.undo();

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([{ type: 'p', colour: 'b' }]);
});

it('records an en passant capture', () => {
  // Arrange
  const chess = play(['e4', 'a6', 'e5', 'd5', 'exd6']);

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([{ type: 'p', colour: 'b' }]);
});

it('records no captures from the starting position', () => {
  // Arrange
  const chess = new Chess();
  chess.reset();

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([]);
});

it('does not treat promotion as a capture', () => {
  // Arrange
  const chess = new Chess('7k/P7/8/8/8/8/7K/r7 w - - 0 1');
  chess.move('a8=Q+');

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([]);
});

it('keeps the new identity of a captured promoted piece', () => {
  // Arrange
  const chess = new Chess('7k/P7/8/8/8/8/7K/r7 w - - 0 1');
  chess.move('a8=Q+');
  chess.move('Rxa8');

  // Act
  const captured = capturedPieces(chess);

  // Assert
  expect(captured).toEqual([{ type: 'q', colour: 'w' }]);
});
