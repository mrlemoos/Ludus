import type { SavedCoachMatch } from '../shared/coaching';

export type CoachHistory = {
  matches: { match: SavedCoachMatch; completedAt: number }[];
  gaps: number;
};

/** Bound legacy snapshot recovery; incomplete history is disclosed rather than guessed. */
export async function loadCoachHistory(
  db: D1Database,
  owner: string,
  current: SavedCoachMatch,
  load: (owner: string, id: string) => Promise<SavedCoachMatch | null>,
): Promise<CoachHistory> {
  const completedAt = current.completedAt;
  if (!completedAt || !Number.isFinite(completedAt)) return { matches: [], gaps: 3 };
  const [known, legacy] = await Promise.all([
    db
      .prepare(`SELECT id,finished_at FROM (
      SELECT id,finished_at FROM matches WHERE owner=? AND result IS NOT NULL AND finished_at<? AND id<>?
      UNION ALL
      SELECT id,finished_at FROM online_matches WHERE (white_id=? OR black_id=?) AND result IS NOT NULL AND finished_at<? AND id<>?
    ) ORDER BY finished_at DESC,id DESC LIMIT 3`)
      .bind(owner, completedAt, current.id, owner, owner, completedAt, current.id)
      .all<{ id: string; finished_at: number }>(),
    db
      .prepare(
        'SELECT id FROM matches WHERE owner=? AND result IS NOT NULL AND finished_at IS NULL AND id<>? AND created_at<? LIMIT 33',
      )
      .bind(owner, current.id, completedAt)
      .all<{ id: string }>(),
  ]);
  if (legacy.results.length > 32) return { matches: [], gaps: 3 };
  let unavailable = 0;
  const candidates = await Promise.all(
    [...known.results, ...legacy.results].map(async (row) => {
      try {
        const match = await load(owner, row.id);
        if (!match?.result || !match.completedAt) {
          unavailable++;
          return null;
        }
        if (match.completedAt >= completedAt) return null;
        return { match, completedAt: match.completedAt };
      } catch {
        unavailable++;
        return null;
      }
    }),
  );
  // A missing snapshot could be more recent than any available match.
  if (unavailable)
    return { matches: [], gaps: Math.min(3, known.results.length + legacy.results.length) };
  const matches = candidates
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.completedAt - a.completedAt || b.match.id.localeCompare(a.match.id))
    .slice(0, 3);
  return { matches, gaps: 0 };
}
