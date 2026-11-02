import { capturedPieces } from './captured-pieces';
import { Chess } from 'chess.js';
import { expect, it } from 'vitest';

it('captures retain actual piece identity and follow replay, including en passant', () => {
  const chess = new Chess();
  for (const move of ['e4', 'd5', 'exd5', 'Qxd5']) {chess.move(move);}
  expect(capturedPieces(chess)).toEqual([
    { type: 'p', colour: 'b' },
    { type: 'p', colour: 'w' },
  ]);
  chess.undo();
  expect(capturedPieces(chess)).toEqual([{ type: 'p', colour: 'b' }]);
  chess.reset();
  for (const move of ['e4', 'a6', 'e5', 'd5', 'exd6']) {chess.move(move);}
  expect(capturedPieces(chess)).toEqual([{ type: 'p', colour: 'b' }]);
  chess.reset();
  expect(capturedPieces(chess)).toEqual([]);
});

it('promotion is not a capture; capturing a promoted piece keeps its new identity', () => {
  const chess = new Chess('7k/P7/8/8/8/8/7K/r7 w - - 0 1');
  chess.move('a8=Q+');
  expect(capturedPieces(chess)).toEqual([]);
  chess.move('Rxa8');
  expect(capturedPieces(chess)).toEqual([{ type: 'q', colour: 'w' }]);
});
