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

const promotingFen = '8/4P3/8/8/8/8/4K3/k7 w - - 0 1';

interface SnapshotCase {
  name: string;
  latest: HumanGame | null;
  incoming: HumanGame;
  prediction: { baseRevision: number; moves: number } | null;
  apply: boolean;
}

const snapshotCases: SnapshotCase[] = [
  {
    name: 'drops a stale echo of the pre-move position',
    latest: sample(3, ['e4'], 10),
    incoming: sample(3, [], 99),
    prediction: { baseRevision: 3, moves: 1 },
    apply: false,
  },
  {
    name: 'drops an echo when no game is loaded yet',
    latest: null,
    incoming: sample(3, [], 10),
    prediction: { baseRevision: 3, moves: 1 },
    apply: false,
  },
  {
    name: 'keeps a newer revision that includes the predicted move',
    latest: sample(3, ['e4'], 10),
    incoming: sample(4, ['e4'], 11),
    prediction: { baseRevision: 3, moves: 1 },
    apply: true,
  },
  {
    name: 'keeps a newer revision when the move list is empty',
    latest: sample(3, ['e4'], 10),
    incoming: sample(4, [], 1),
    prediction: { baseRevision: 3, moves: 1 },
    apply: true,
  },
  {
    name: 'keeps the same revision when it already includes the predicted moves',
    latest: sample(3, ['e4'], 10),
    incoming: sample(3, ['e4'], 10),
    prediction: { baseRevision: 3, moves: 1 },
    apply: true,
  },
  {
    name: 'drops an older revision when nothing is pending',
    latest: sample(5, ['e4'], 10),
    incoming: sample(4, ['e4', 'e5'], 99),
    prediction: null,
    apply: false,
  },
  {
    name: 'drops an older timestamp at the same revision',
    latest: sample(4, ['e4'], 20),
    incoming: sample(4, ['e4'], 19),
    prediction: null,
    apply: false,
  },
  {
    name: 'keeps an identical snapshot',
    latest: sample(4, ['e4'], 20),
    incoming: sample(4, ['e4'], 20),
    prediction: null,
    apply: true,
  },
  {
    name: 'keeps a newer timestamp at the same revision',
    latest: sample(4, ['e4'], 20),
    incoming: sample(4, ['e4'], 21),
    prediction: null,
    apply: true,
  },
  {
    name: 'keeps a newer revision',
    latest: sample(4, ['e4'], 20),
    incoming: sample(5, ['e4', 'e5'], 1),
    prediction: null,
    apply: true,
  },
  {
    name: 'accepts the first snapshot',
    latest: null,
    incoming: sample(0, []),
    prediction: null,
    apply: true,
  },
  {
    name: 'accepts a snapshot for a different game',
    latest: sample(9, ['e4'], 50, 'a'),
    incoming: sample(1, [], 1, 'b'),
    prediction: null,
    apply: true,
  },
];

describe('optimistic online moves', () => {
  it('appends the SAN and position without touching clocks, revision, or the original game', () => {
    // Arrange
    const game = { ...fresh(), drawOffer: 'b' as const };
    const played = new Chess();
    played.move({ from: 'e2', to: 'e4' });

    // Act
    const next = predictMove(game, 'e2', 'e4');

    // Assert
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

  it('returns null for an illegal move', () => {
    // Arrange
    const game = fresh();

    // Act
    const next = predictMove(game, 'e2', 'e5');

    // Assert
    expect(next).toBeNull();
    expect(game.moves).toEqual([]);
  });

  it('returns null when a promotion piece is missing', () => {
    // Arrange
    const game = fresh();
    const promoting = { ...game, fen: promotingFen };

    // Act
    const next = predictMove(promoting, 'e7', 'e8');

    // Assert
    expect(next).toBeNull();
    expect(promoting.moves).toEqual([]);
  });

  it('predicts a promoting move', () => {
    // Arrange
    const game = fresh();
    const promoting = { ...game, fen: promotingFen };

    // Act
    const next = predictMove(promoting, 'e7', 'e8', 'q');

    // Assert
    expect(next).toMatchObject({
      moves: ['e8=Q'],
      drawOffer: null,
      clocks: promoting.clocks,
      revision: promoting.revision,
      updatedAt: promoting.updatedAt,
      result: null,
      players: promoting.players,
      control: promoting.control,
    });
    expect(promoting.moves).toEqual([]);
  });

  it('returns null for a finished game', () => {
    // Arrange
    const game = fresh();
    const finished = {
      ...game,
      result: { winner: 'w' as const, reason: 'resignation' as const, at: 2 },
    };

    // Act
    const next = predictMove(finished, 'e2', 'e4');

    // Assert
    expect(next).toBeNull();
    expect(game.moves).toEqual([]);
  });

  it.each(snapshotCases)('$name', ({ latest, incoming, prediction, apply }) => {
    // Arrange

    // Act
    const shouldApply = shouldApplySnapshot(latest, incoming, prediction);

    // Assert
    expect(shouldApply).toBe(apply);
  });
});
