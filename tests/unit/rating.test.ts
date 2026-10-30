import { describe, expect, it } from 'vitest';
import { initialRating, provisional, rate, rateMatch } from '../../shared/rating';
describe('Glicko-2 periods', () => {
  it('matches Glickman’s published numerical example', () => {
    const result = rate({ rating: 1500, deviation: 200, volatility: 0.06, games: 0 }, [
      { rating: { ...initialRating(), rating: 1400, deviation: 30 }, score: 1 },
      { rating: { ...initialRating(), rating: 1550, deviation: 100 }, score: 0 },
      { rating: { ...initialRating(), rating: 1700, deviation: 300 }, score: 0 },
    ]);
    expect(result.rating).toBeCloseTo(1464.05, 2);
    expect(result.deviation).toBeCloseTo(151.52, 2);
    expect(result.volatility).toBeCloseTo(0.059996, 6);
  });
  it('updates both opponents from pre-match ratings, independently per period', () => {
    const initial = initialRating(), after = rateMatch(initial, initial, 'w');
    expect(after.w.rating).toBeGreaterThan(1500); expect(after.b.rating).toBeLessThan(1500);
    expect(after.w.rating - 1500).toBeCloseTo(1500 - after.b.rating, 8);
    expect(initial.games).toBe(0); expect(after.w.games).toBe(1);
    expect(rateMatch(initial, initial, null).w.rating).toBe(1500);
  });
  it('shows provisional status only before ten games and handles inactivity', () => {
    expect(provisional({ ...initialRating(), games: 9 })).toBe(true);
    expect(provisional({ ...initialRating(), games: 10 })).toBe(false);
    expect(rate({ ...initialRating(), deviation: 100 }, []).deviation).toBeGreaterThan(100);
    expect(() => rate({ ...initialRating(), volatility: 0 }, [])).toThrow('invalid_rating');
    expect(() => rate(initialRating(), [{ rating: initialRating(), score: 2 }])).toThrow('invalid_score');
  });
});
