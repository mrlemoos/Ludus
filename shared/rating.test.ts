import { initialRating, provisional, rate, rateMatch } from './rating';
import { describe, expect, it } from 'vitest';

describe('glicko-2 periods', () => {
  it('matches Glickman’s published numerical example', () => {
    // Arrange
    const player = { rating: 1500, deviation: 200, volatility: 0.06, games: 0 };
    const opponents = [
      { rating: { ...initialRating(), rating: 1400, deviation: 30 }, score: 1 },
      { rating: { ...initialRating(), rating: 1550, deviation: 100 }, score: 0 },
      { rating: { ...initialRating(), rating: 1700, deviation: 300 }, score: 0 },
    ];

    // Act
    const result = rate(player, opponents);

    // Assert
    expect(result.rating).toBeCloseTo(1464.05, 2);
    expect(result.deviation).toBeCloseTo(151.52, 2);
    expect(result.volatility).toBeCloseTo(0.059996, 6);
  });

  it('updates both opponents from pre-match ratings, independently per period', () => {
    // Arrange
    const white = initialRating();
    const black = initialRating();

    // Act
    const after = rateMatch(white, black, 'w');

    // Assert
    expect(after.w.rating).toBeGreaterThan(1500);
    expect(after.b.rating).toBeLessThan(1500);
    expect(after.w.rating - 1500).toBeCloseTo(1500 - after.b.rating, 8);
    expect(white.games).toBe(0);
    expect(after.w.games).toBe(1);
  });

  it('rateMatch, a draw from equal ratings, leaves the white rating unchanged', () => {
    // Arrange
    const white = initialRating();
    const black = initialRating();

    // Act
    const after = rateMatch(white, black, null);

    // Assert
    expect(after.w.rating).toBe(1500);
  });

  it('provisional, nine games, stays provisional', () => {
    // Arrange
    const rating = { ...initialRating(), games: 9 };

    // Act
    const pending = provisional(rating);

    // Assert
    expect(pending).toBe(true);
  });

  it('provisional, ten games, leaves provisional status', () => {
    // Arrange
    const rating = { ...initialRating(), games: 10 };

    // Act
    const pending = provisional(rating);

    // Assert
    expect(pending).toBe(false);
  });

  it('rate, a period with no games, increases the deviation', () => {
    // Arrange
    const rating = { ...initialRating(), deviation: 100 };

    // Act
    const next = rate(rating, []);

    // Assert
    expect(next.deviation).toBeGreaterThan(100);
  });

  it('rate, zero volatility, throws invalid rating', () => {
    // Arrange
    const rating = { ...initialRating(), volatility: 0 };

    // Act
    function update() {
      rate(rating, []);
    }

    // Assert
    expect(update).toThrow('invalid_rating');
  });

  it('rate, a score outside the result range, throws invalid score', () => {
    // Arrange
    const rating = initialRating();

    // Act
    function update() {
      rate(rating, [{ rating, score: 2 }]);
    }

    // Assert
    expect(update).toThrow('invalid_score');
  });
});
