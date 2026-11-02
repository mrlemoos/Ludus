import { createHumanGame, humanConnection } from '../shared/human-game';
import type { HumanGame } from '../shared/human-game';
import { predictMove, shouldApplySnapshot } from './online-move';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

function fresh() {
  return humanConnection(
    humanConnection(
      createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 1),
      'w',
      true,
      1,
    ),
    'b',
    true,
    1,
  );
}
function sample(revision: number, moves: string[], updatedAt = 10, id = 'id'): HumanGame {
  return {
    ...fresh(),
    id,
    revision,
    moves,
    updatedAt,
  };
}

describe('optimistic online moves', () => {
  it('appends the SAN and position without touching clocks, revision, or the original game', () => {
    const game = { ...fresh(), drawOffer: 'b' as const };
    const played = new Chess();
    played.move({ from: 'e2', to: 'e4' });
    const next = predictMove(game, 'e2', 'e4');
    expect(next).toMatchObject({
      moves: ['e4'],
      fen: played.fen(),
      drawOffer: null,
      clocks: game.clocks,
      revision: game.revision,
      updatedAt: game.updatedAt,
      result: null,
      players: game.players,
      control: game.control,
    });
    expect(next).not.toBe(game);
    expect(game.moves).toEqual([]);
    expect(game.drawOffer).toBe('b');
    expect(game.fen).toBe(new Chess().fen());
  });

  it('returns null for an illegal move, a missing promotion, or a finished game', () => {
    const game = fresh();
    const promoting = { ...game, fen: '8/4P3/8/8/8/8/4K3/k7 w - - 0 1' };
    expect(predictMove(game, 'e2', 'e5')).toBeNull();
    expect(predictMove(promoting, 'e7', 'e8')).toBeNull();
    expect(predictMove(promoting, 'e7', 'e8', 'q')).toMatchObject({
      moves: ['e8=Q'],
      drawOffer: null,
      clocks: promoting.clocks,
      revision: promoting.revision,
      updatedAt: promoting.updatedAt,
      result: null,
      players: promoting.players,
      control: promoting.control,
    });
    const finished = {
      ...game,
      result: { winner: 'w' as const, reason: 'resignation' as const, at: 2 },
    };
    expect(predictMove(finished, 'e2', 'e4')).toBeNull();
    expect(game.moves).toEqual([]);
    expect(promoting.moves).toEqual([]);
  });

  it('drops a stale echo of the pre-move position and keeps a newer server revision', () => {
    const baseline = sample(3, ['e4'], 10);
    expect(shouldApplySnapshot(baseline, sample(3, [], 99), { baseRevision: 3, moves: 1 })).toBe(
      false,
    );
    expect(shouldApplySnapshot(null, sample(3, [], 10), { baseRevision: 3, moves: 1 })).toBe(false);
    expect(
      shouldApplySnapshot(baseline, sample(4, ['e4'], 11), { baseRevision: 3, moves: 1 }),
    ).toBe(true);
    expect(shouldApplySnapshot(baseline, sample(4, [], 1), { baseRevision: 3, moves: 1 })).toBe(
      true,
    );
    expect(
      shouldApplySnapshot(baseline, sample(3, ['e4'], 10), { baseRevision: 3, moves: 1 }),
    ).toBe(true);
    expect(shouldApplySnapshot(sample(5, ['e4'], 10), sample(4, ['e4', 'e5'], 99), null)).toBe(
      false,
    );
    expect(shouldApplySnapshot(sample(4, ['e4'], 20), sample(4, ['e4'], 19), null)).toBe(false);
    expect(shouldApplySnapshot(sample(4, ['e4'], 20), sample(4, ['e4'], 20), null)).toBe(true);
    expect(shouldApplySnapshot(sample(4, ['e4'], 20), sample(4, ['e4'], 21), null)).toBe(true);
    expect(shouldApplySnapshot(sample(4, ['e4'], 20), sample(5, ['e4', 'e5'], 1), null)).toBe(true);
    expect(shouldApplySnapshot(null, sample(0, []), null)).toBe(true);
    expect(shouldApplySnapshot(sample(9, ['e4'], 50, 'a'), sample(1, [], 1, 'b'), null)).toBe(true);
  });
});
