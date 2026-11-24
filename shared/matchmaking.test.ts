import { canAcceptAI, matchingOpponent, ratingTolerance } from './matchmaking';
import type { QueueEntry } from './matchmaking';
import { describe, expect, it } from 'vitest';

function entry(changes: Partial<QueueEntry> = {}): QueueEntry {
  return {
    user: 'one',
    control: '5+3',
    rated: true,
    rating: 1500,
    joinedAt: 0,
    token: 'token',
    ...changes,
  };
}

describe('public matchmaking policy', () => {
  it.each([
    [14_999, 200],
    [15_000, 300],
    [90_000, 600],
  ])('ratingTolerance, after %i milliseconds, returns %i', (wait, expected) => {
    // Arrange
    const waited = wait;

    // Act
    const tolerance = ratingTolerance(waited);

    // Assert
    expect(tolerance).toBe(expected);
  });

  it('keeps controls, mode and account identity isolated', () => {
    // Arrange
    const one = entry();
    const candidates = [
      entry(),
      entry({ user: 'two', control: '10+5' }),
      entry({ user: 'three', rated: false }),
    ];

    // Act
    const opponent = matchingOpponent(one, candidates, 30_000);

    // Assert
    expect(opponent).toBeNull();
  });

  it('matchingOpponent, a rating outside the shorter tolerance, returns no opponent', () => {
    // Arrange
    const one = entry({ joinedAt: 15_000 });
    const candidates = [entry({ user: 'two', rating: 1800 })];

    // Act
    const opponent = matchingOpponent(one, candidates, 15_000);

    // Assert
    expect(opponent).toBeNull();
  });

  it('matchingOpponent, a rating inside both tolerances, returns that opponent', () => {
    // Arrange
    const one = entry({ joinedAt: 15_000 });
    const candidates = [entry({ user: 'two', rating: 1800 })];

    // Act
    const opponent = matchingOpponent(one, candidates, 30_000);

    // Assert
    expect(opponent?.user).toBe('two');
  });

  it('matchingOpponent, several eligible opponents, returns the oldest', () => {
    // Arrange
    const one = entry({ rated: false });
    const candidates = [
      entry({ user: 'new', rated: false, joinedAt: 5 }),
      entry({ user: 'old', rated: false, rating: 9000 }),
    ];

    // Act
    const opponent = matchingOpponent(one, candidates, 100);

    // Assert
    expect(opponent?.user).toBe('old');
  });

  it.each([
    ['token', 29_999, false],
    ['token', 30_000, true],
    ['old-token', 60_000, false],
  ] as const)(
    'canAcceptAI, token %s at %i milliseconds, returns %s',
    (token, instant, expected) => {
      // Arrange
      const queued = entry();

      // Act
      const accepted = canAcceptAI(queued, token, instant);

      // Assert
      expect(accepted).toBe(expected);
    },
  );
});
