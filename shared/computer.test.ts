import {
  type ComputerHistory,
  coachIdentity,
  computerSettings,
  suggestDifficulty,
} from './computer';
import type { Difficulty } from './game';
import { describe, expect, it } from 'vitest';

const game = (
  winner: 'w' | 'b' | null,
  completedAt: number,
  difficulty: Difficulty = 2,
): ComputerHistory => ({
  difficulty,
  colour: 'w',
  result: { winner, reason: 'checkmate' },
  completedAt,
});

describe('computer strength suggestions', () => {
  it('shares a named opponent and coach identity without an Elo claim', () => {
    expect(coachIdentity.name).toBe('Lucía');
    const settings = Object.values(computerSettings);
    expect(new Set(settings.map((setting) => setting.skill)).size).toBe(4);
    expect(
      settings.every(
        (setting, i) =>
          i === 0 ||
          (setting.depth > settings[i - 1].depth &&
            setting.moveTimeMs > settings[i - 1].moveTimeMs),
      ),
    ).toBe(true);
  });
  it('suggests an initial strength independently of teaching vocabulary', () => {
    expect(suggestDifficulty('beginner', 2, [])).toEqual({ difficulty: 1, reason: 'onboarding' });
    expect(suggestDifficulty('advanced', 1, [])).toEqual({ difficulty: 4, reason: 'onboarding' });
    expect(suggestDifficulty('casual', 2, [])).toBeNull();
  });
  it('requires enough finished games at the selected strength', () => {
    expect(suggestDifficulty('advanced', 2, [game('w', 1)])).toBeNull();
    expect(
      suggestDifficulty(
        'advanced',
        2,
        Array.from({ length: 5 }, (_, i) => game('w', i, 1)),
      ),
    ).toBeNull();
  });
  it('suggests one step up after four wins among five most recent games', () => {
    const history = [
      game('b', 0),
      ...Array.from({ length: 4 }, (_, i) => game('w', i + 1)),
      game(null, 5),
    ];
    const snapshot = structuredClone(history);
    expect(suggestDifficulty('beginner', 2, history)).toEqual({
      difficulty: 3,
      reason: 'recentWins',
    });
    expect(history).toEqual(snapshot);
  });
  it('counts player colour, excludes unfinished games and never counts draws as losses', () => {
    const losses = Array.from({ length: 5 }, (_, i) => ({ ...game('w', i), colour: 'b' as const }));
    expect(suggestDifficulty('advanced', 2, losses)).toEqual({
      difficulty: 1,
      reason: 'recentLosses',
    });
    expect(
      suggestDifficulty(
        'advanced',
        2,
        Array.from({ length: 5 }, (_, i) => game(null, i)),
      ),
    ).toBeNull();
    expect(
      suggestDifficulty(
        'advanced',
        2,
        losses.map((entry) => ({ ...entry, result: null })),
      ),
    ).toEqual({ difficulty: 4, reason: 'onboarding' });
  });
  it('does not exceed the four available strengths', () => {
    expect(
      suggestDifficulty(
        'advanced',
        4,
        Array.from({ length: 5 }, (_, i) => game('w', i, 4)),
      ),
    ).toBeNull();
    expect(
      suggestDifficulty(
        'beginner',
        1,
        Array.from({ length: 5 }, (_, i) => game('b', i, 1)),
      ),
    ).toBeNull();
  });
});
