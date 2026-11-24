import type { Game } from './game';
import { replayMove, replayPosition, savedReplay, stepReplay } from './replay';
import { describe, expect, it } from 'vitest';

function finished(moves = ['e4', 'e5', 'Nf3', 'Nc6']): Pick<Game, 'moves' | 'result'> {
  return {
    moves,
    result: { winner: 'b', reason: 'resignation' },
  };
}

describe('private replay variations', () => {
  it('branches from a saved position without mutating recorded moves or results', () => {
    // Arrange
    const game = finished();
    const saved = savedReplay(game, 1);

    // Act
    const branch = replayMove(game, saved, { from: 'c7', to: 'c5' });

    // Assert
    expect(branch).toEqual({ moves: ['e4', 'c5'], ply: 2, branchAt: 1 });
    expect(saved.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(game).toEqual({
      moves: ['e4', 'e5', 'Nf3', 'Nc6'],
      result: { winner: 'b', reason: 'resignation' },
    });
  });

  it('replayPosition, a c5 branch, places a black pawn on c5', () => {
    // Arrange
    const game = finished();
    const branch = replayMove(game, savedReplay(game, 1), { from: 'c7', to: 'c5' });

    // Act
    const piece = replayPosition(game, branch).get('c5');

    // Assert
    expect(piece?.color).toBe('b');
  });

  it('replayPosition, the branch point, matches the saved position', () => {
    // Arrange
    const game = finished();
    const saved = savedReplay(game, 1);
    const branch = replayMove(game, saved, { from: 'c7', to: 'c5' });

    // Act
    const branched = replayPosition(game, savedReplay(game, branch.branchAt!)).fen();
    const recorded = replayPosition(game, saved).fen();

    // Assert
    expect(branched).toBe(recorded);
  });

  it('plays both sides and truncates only the explored continuation after stepping back', () => {
    // Arrange
    const game = finished();
    const first = replayMove(game, savedReplay(game, 0), { from: 'd2', to: 'd4' });
    const second = replayMove(game, first, { from: 'd7', to: 'd5' });
    const branch = replayMove(game, second, { from: 'c2', to: 'c4' });

    // Act
    const replacement = replayMove(game, stepReplay(branch, -1), { from: 'g1', to: 'f3' });

    // Assert
    expect(replacement.moves).toEqual(['d4', 'd5', 'Nf3']);
    expect(replacement.branchAt).toBe(0);
    expect(branch.moves).toEqual(['d4', 'd5', 'c4']);
  });

  it('stepReplay, a large forward step, stays on the last ply', () => {
    // Arrange
    const game = finished();
    const branch = replayMove(game, savedReplay(game, 1), { from: 'c7', to: 'c5' });

    // Act
    const stepped = stepReplay(branch, 100);

    // Assert
    expect(stepped.ply).toBe(2);
  });

  it('stepReplay, a large backward step, stays on the first ply', () => {
    // Arrange
    const game = finished();
    const branch = replayMove(game, savedReplay(game, 1), { from: 'c7', to: 'c5' });

    // Act
    const stepped = stepReplay(branch, -100);

    // Assert
    expect(stepped.ply).toBe(0);
  });

  it('stepReplay, one ply back and forward, restores the branch', () => {
    // Arrange
    const game = finished();
    const branch = replayMove(game, savedReplay(game, 1), { from: 'c7', to: 'c5' });

    // Act
    const restored = stepReplay(stepReplay(branch, -1), 1);

    // Assert
    expect(restored).toEqual({ moves: ['e4', 'c5'], ply: 2, branchAt: 1 });
  });

  it('savedReplay, a finished game, returns the recorded moves', () => {
    // Arrange
    const game = finished();

    // Act
    const replay = savedReplay(game);

    // Assert
    expect(replay.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('rejects illegal moves and leaves the explored position unchanged', () => {
    // Arrange
    const game = finished();
    const replay = savedReplay(game, 0);

    // Act
    function play() {
      replayMove(game, replay, { from: 'e2', to: 'e5' });
    }

    // Assert
    expect(play).toThrow();
    expect(replay).toEqual({
      moves: ['e4', 'e5', 'Nf3', 'Nc6'],
      ply: 0,
      branchAt: null,
    });
  });

  it('replayMove, an underpromotion, places a knight on the promotion square', () => {
    // Arrange
    const game = finished(['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']);

    // Act
    const promoted = replayMove(game, savedReplay(game), { from: 'b7', to: 'a8', promotion: 'n' });
    const piece = replayPosition(game, promoted).get('a8');

    // Assert
    expect(piece?.type).toBe('n');
  });

  it('replayMove, an en passant capture, removes the captured pawn', () => {
    // Arrange
    const game = finished(['e4', 'a6', 'e5', 'd5']);
    const captured = replayMove(game, savedReplay(game), { from: 'e5', to: 'd6' });

    // Act
    const pawn = replayPosition(game, captured).get('d5');

    // Assert
    expect(pawn).toBeUndefined();
  });

  it('replayMove, castling, moves the rook beside the king', () => {
    // Arrange
    const game = finished(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']);

    // Act
    const branch = replayMove(game, savedReplay(game), { from: 'e1', to: 'g1' });
    const piece = replayPosition(game, branch).get('f1');

    // Assert
    expect(piece?.type).toBe('r');
  });

  it('replayMove, a move after checkmate, throws', () => {
    // Arrange
    const game = finished(['f3', 'e5', 'g4', 'Qh4#']);

    // Act
    function play() {
      replayMove(game, savedReplay(game), { from: 'a2', to: 'a3' });
    }

    // Assert
    expect(play).toThrow();
  });

  it('replayPosition, the start of a finished game, is the initial position', () => {
    // Arrange
    const game = finished(['f3', 'e5', 'g4', 'Qh4#']);
    const replay = savedReplay(game, 0);

    // Act
    const fen = replayPosition(game, replay).fen();

    // Assert
    expect(fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('savedReplay, a live game, throws unfinished', () => {
    // Arrange
    const live = { moves: ['e4'], result: null };

    // Act
    function open() {
      savedReplay(live);
    }

    // Assert
    expect(open).toThrow('unfinished');
  });

  it('replayPosition, a live game, throws unfinished', () => {
    // Arrange
    const live = { moves: ['e4'], result: null };

    // Act
    function open() {
      replayPosition(live, { moves: [], ply: 0, branchAt: null });
    }

    // Assert
    expect(open).toThrow('unfinished');
  });

  it('replayMove, a live game, throws unfinished', () => {
    // Arrange
    const live = { moves: ['e4'], result: null };

    // Act
    function play() {
      replayMove(live, { moves: [], ply: 0, branchAt: null }, { from: 'd2', to: 'd4' });
    }

    // Assert
    expect(play).toThrow('unfinished');
  });

  it.each([-1, 5, 0.5, Number.NaN])('rejects invalid saved cursor %s', (ply) => {
    // Arrange
    const game = finished();

    // Act
    function open() {
      savedReplay(game, ply);
    }

    // Assert
    expect(open).toThrow('invalid_ply');
  });
});
