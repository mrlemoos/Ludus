import type { Game } from './game';
import { replayMove, replayPosition, savedReplay, stepReplay } from './replay';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
const finished = (moves = ['e4', 'e5', 'Nf3', 'Nc6']): Pick<Game, 'moves' | 'result'> => ({
  moves,
  result: { winner: 'b', reason: 'resignation' },
});

describe('private replay variations', () => {
  it('branches from a saved position without mutating recorded moves or results', () => {
    const game = finished();
    const original = structuredClone(game);
    const saved = savedReplay(game, 1);
    const branch = replayMove(game, saved, { from: 'c7', to: 'c5' });
    expect(branch).toEqual({ moves: ['e4', 'c5'], ply: 2, branchAt: 1 });
    expect(saved.moves).toEqual(original.moves);
    expect(game).toEqual(original);
    expect(replayPosition(game, branch).get('c5')?.color).toBe('b');
    expect(replayPosition(game, savedReplay(game, branch.branchAt!)).fen()).toBe(
      replayPosition(game, saved).fen(),
    );
  });
  it('plays both sides and truncates only the explored continuation after stepping back', () => {
    const game = finished();
    let branch = replayMove(game, savedReplay(game, 0), { from: 'd2', to: 'd4' });
    branch = replayMove(game, branch, { from: 'd7', to: 'd5' });
    branch = replayMove(game, branch, { from: 'c2', to: 'c4' });
    const replacement = replayMove(game, stepReplay(branch, -1), { from: 'g1', to: 'f3' });
    expect(replacement.moves).toEqual(['d4', 'd5', 'Nf3']);
    expect(replacement.branchAt).toBe(0);
    expect(branch.moves).toEqual(['d4', 'd5', 'c4']);
  });
  it('keeps saved and variation navigation inside each line', () => {
    const game = finished();
    const branch = replayMove(game, savedReplay(game, 1), { from: 'c7', to: 'c5' });
    expect(stepReplay(branch, 100).ply).toBe(2);
    expect(stepReplay(branch, -100).ply).toBe(0);
    expect(stepReplay(stepReplay(branch, -1), 1)).toEqual(branch);
    expect(savedReplay(game).moves).toEqual(game.moves);
  });
  it('rejects illegal moves and leaves the explored position unchanged', () => {
    const game = finished();
    const replay = savedReplay(game, 0);
    const before = structuredClone(replay);
    expect(() => replayMove(game, replay, { from: 'e2', to: 'e5' })).toThrow();
    expect(replay).toEqual(before);
  });
  it('preserves legal underpromotion and en passant in variations', () => {
    const moves = ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2'];
    const game = finished(moves);
    const promoted = replayMove(game, savedReplay(game), { from: 'b7', to: 'a8', promotion: 'n' });
    expect(replayPosition(game, promoted).get('a8')?.type).toBe('n');
    const passant = finished(['e4', 'a6', 'e5', 'd5']);
    const captured = replayMove(passant, savedReplay(passant), { from: 'e5', to: 'd6' });
    expect(replayPosition(passant, captured).get('d5')).toBeUndefined();
  });
  it('retains castling history and rejects moves beyond checkmate', () => {
    const castle = finished(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']);
    const branch = replayMove(castle, savedReplay(castle), { from: 'e1', to: 'g1' });
    expect(replayPosition(castle, branch).get('f1')?.type).toBe('r');
    const mate = finished(['f3', 'e5', 'g4', 'Qh4#']);
    expect(() => replayMove(mate, savedReplay(mate), { from: 'a2', to: 'a3' })).toThrow();
    expect(replayPosition(mate, savedReplay(mate, 0)).fen()).toBe(new Chess().fen());
  });
  it('never exposes replay helpers for a live game', () => {
    const live = { moves: ['e4'], result: null };
    expect(() => savedReplay(live)).toThrow('unfinished');
    expect(() => replayPosition(live, { moves: [], ply: 0, branchAt: null })).toThrow('unfinished');
    expect(() =>
      replayMove(live, { moves: [], ply: 0, branchAt: null }, { from: 'd2', to: 'd4' }),
    ).toThrow('unfinished');
  });
  it.each([-1, 5, 0.5, NaN])('rejects invalid saved cursor %s', (ply) => {
    expect(() => savedReplay(finished(), ply)).toThrow('invalid_ply');
  });
});
