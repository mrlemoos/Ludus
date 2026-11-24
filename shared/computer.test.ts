import { coachIdentity, computerSettings, suggestDifficulty } from './computer';
import type { ChessLevel, ComputerHistory, DifficultySuggestion } from './computer';
import type { Difficulty } from './game';
import { describe, expect, it } from 'vitest';

function game(
  winner: 'w' | 'b' | null,
  completedAt: number,
  difficulty: Difficulty = 2,
): ComputerHistory {
  return {
    difficulty,
    colour: 'w',
    result: { winner, reason: 'checkmate' },
    completedAt,
  };
}

describe('computer constants', () => {
  it('coachIdentity, named coach, matches the recorded snapshot', () => {
    // Arrange
    const identity = coachIdentity;

    // Act
    const recorded = identity;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "name": "Lucía",
      }
    `);
  });

  it('computerSettings, strength table, matches the recorded snapshot', () => {
    // Arrange
    const settings = computerSettings;

    // Act
    const recorded = settings;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "1": {
          "depth": 3,
          "moveTimeMs": 100,
          "skill": 0,
        },
        "2": {
          "depth": 6,
          "moveTimeMs": 250,
          "skill": 4,
        },
        "3": {
          "depth": 10,
          "moveTimeMs": 500,
          "skill": 10,
        },
        "4": {
          "depth": 16,
          "moveTimeMs": 1200,
          "skill": 20,
        },
      }
    `);
  });

  it('computerSettings, the four levels, use distinct skills', () => {
    // Arrange
    const skills = Object.values(computerSettings).map((setting) => setting.skill);

    // Act
    const distinct = new Set(skills).size;

    // Assert
    expect(distinct).toBe(4);
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
  ] as const)(
    'computerSettings, level %i against level %i, increases depth and move time',
    (lower, higher) => {
      // Arrange
      const weaker = computerSettings[lower];
      const stronger = computerSettings[higher];

      // Act
      const strongerSettings =
        stronger.depth > weaker.depth && stronger.moveTimeMs > weaker.moveTimeMs;

      // Assert
      expect(strongerSettings).toBe(true);
    },
  );
});

describe('computer strength suggestions', () => {
  it.each<[ChessLevel, Difficulty, DifficultySuggestion | null]>([
    ['beginner', 2, { difficulty: 1, reason: 'onboarding' }],
    ['advanced', 1, { difficulty: 4, reason: 'onboarding' }],
    ['casual', 2, null],
  ])(
    'suggestDifficulty, %s already on %i with no games, returns %j',
    (level, selected, expected) => {
      // Arrange
      const history: ComputerHistory[] = [];

      // Act
      const suggestion = suggestDifficulty(level, selected, history);

      // Assert
      expect(suggestion).toEqual(expected);
    },
  );

  it('suggestDifficulty, one finished game at the selected strength, makes no suggestion', () => {
    // Arrange
    const history = [game('w', 1)];

    // Act
    const suggestion = suggestDifficulty('advanced', 2, history);

    // Assert
    expect(suggestion).toBeNull();
  });

  it('suggestDifficulty, five finished games at another strength, makes no suggestion', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => game('w', index, 1));

    // Act
    const suggestion = suggestDifficulty('advanced', 2, history);

    // Assert
    expect(suggestion).toBeNull();
  });

  it('suggests one step up after four wins among five most recent games', () => {
    // Arrange
    const history = [
      game('b', 0),
      ...Array.from({ length: 4 }, (_, index) => game('w', index + 1)),
      game(null, 5),
    ];
    const before = structuredClone(history);

    // Act
    const suggestion = suggestDifficulty('beginner', 2, history);

    // Assert
    expect(suggestion).toEqual({ difficulty: 3, reason: 'recentWins' });
    expect(history).toEqual(before);
  });

  it('suggestDifficulty, five losses with the player as black, steps down one strength', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => ({
      ...game('w', index),
      colour: 'b' as const,
    }));

    // Act
    const suggestion = suggestDifficulty('advanced', 2, history);

    // Assert
    expect(suggestion).toEqual({ difficulty: 1, reason: 'recentLosses' });
  });

  it('suggestDifficulty, five draws, makes no suggestion', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => game(null, index));

    // Act
    const suggestion = suggestDifficulty('advanced', 2, history);

    // Assert
    expect(suggestion).toBeNull();
  });

  it('suggestDifficulty, unfinished games only, uses the onboarding strength', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => ({
      ...game('w', index),
      colour: 'b' as const,
      result: null,
    }));

    // Act
    const suggestion = suggestDifficulty('advanced', 2, history);

    // Assert
    expect(suggestion).toEqual({ difficulty: 4, reason: 'onboarding' });
  });

  it('suggestDifficulty, five wins at the highest strength, makes no suggestion', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => game('w', index, 4));

    // Act
    const suggestion = suggestDifficulty('advanced', 4, history);

    // Assert
    expect(suggestion).toBeNull();
  });

  it('suggestDifficulty, five losses at the lowest strength, makes no suggestion', () => {
    // Arrange
    const history = Array.from({ length: 5 }, (_, index) => game('b', index, 1));

    // Act
    const suggestion = suggestDifficulty('beginner', 1, history);

    // Assert
    expect(suggestion).toBeNull();
  });
});
