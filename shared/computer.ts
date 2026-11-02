import type { Difficulty, Result } from './game';
import type { Color } from 'chess.js';

export const coachIdentity = { name: 'Lucía' } as const;
export const computerSettings = {
  1: { skill: 0, depth: 3, moveTimeMs: 100 },
  2: { skill: 4, depth: 6, moveTimeMs: 250 },
  3: { skill: 10, depth: 10, moveTimeMs: 500 },
  4: { skill: 20, depth: 16, moveTimeMs: 1200 },
} as const satisfies Record<Difficulty, { skill: number; depth: number; moveTimeMs: number }>;

export type ChessLevel = 'beginner' | 'casual' | 'intermediate' | 'advanced';
export type ComputerHistory = {
  difficulty: Difficulty;
  colour: Color;
  result: Result | null;
  completedAt: number;
};
export type DifficultySuggestion = {
  difficulty: Difficulty;
  reason: 'onboarding' | 'recentWins' | 'recentLosses';
};

// Suggestions never update a selection. Callers require an explicit player choice.
// Thresholds are provisional until representative-device strength calibration.
export function suggestDifficulty(
  level: ChessLevel,
  selected: Difficulty,
  history: readonly ComputerHistory[],
): DifficultySuggestion | null {
  const recent = history
    .filter((game) => game.result && game.difficulty === selected)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5);
  if (recent.length === 5) {
    const wins = recent.filter((game) => game.result!.winner === game.colour).length;
    const losses = recent.filter(
      (game) => game.result!.winner !== null && game.result!.winner !== game.colour,
    ).length;
    if (wins >= 4 && selected < 4)
      {return { difficulty: (selected + 1) as Difficulty, reason: 'recentWins' };}
    if (losses >= 4 && selected > 1)
      {return { difficulty: (selected - 1) as Difficulty, reason: 'recentLosses' };}
    return null;
  }
  if (history.some((game) => game.result)) {return null;}
  const difficulty = { beginner: 1, casual: 2, intermediate: 3, advanced: 4 }[level] as Difficulty;
  return difficulty === selected ? null : { difficulty, reason: 'onboarding' };
}
