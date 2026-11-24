import { dailyActivity, earnsActivity, localDate, nextMidnight, timezoneChange } from './activity';
import { describe, expect, it } from 'vitest';

describe('activity eligibility', () => {
  it.each(['checkmate', 'stalemate'])('always credits %s', (reason) => {
    // Arrange
    const moves = 0;

    // Act
    const credited = earnsActivity(reason, moves);

    // Assert
    expect(credited).toBe(true);
  });

  it.each(['resignation', 'timeout', 'agreement', 'material', 'repetition', 'fiftyMoves'])(
    'earnsActivity, %s before each player has made five moves, withholds credit',
    (reason) => {
      // Arrange
      const moves = 9;

      // Act
      const credited = earnsActivity(reason, moves);

      // Assert
      expect(credited).toBe(false);
    },
  );

  it.each(['resignation', 'timeout', 'agreement', 'material', 'repetition', 'fiftyMoves'])(
    'earnsActivity, %s once each player has made five moves, credits the match',
    (reason) => {
      // Arrange
      const moves = 10;

      // Act
      const credited = earnsActivity(reason, moves);

      // Assert
      expect(credited).toBe(true);
    },
  );

  it.each(['abort', 'aborted', 'review', 'unknown'])('never credits %s', (reason) => {
    // Arrange
    const moves = 99;

    // Act
    const credited = earnsActivity(reason, moves);

    // Assert
    expect(credited).toBe(false);
  });
});

describe('player timezones', () => {
  it.each([
    ['2026-03-29T00:00:00Z', 'Europe/Madrid', '2026-03-29T22:00:00.000Z'],
    ['2026-10-25T00:00:00Z', 'Europe/Madrid', '2026-10-25T23:00:00.000Z'],
    ['2026-10-30T00:00:00Z', 'America/Sao_Paulo', '2026-10-30T03:00:00.000Z'],
  ])('finds actual next midnight through DST: %s %s', (now, zone, expected) => {
    // Arrange
    const instant = Date.parse(now);

    // Act
    const midnight = new Date(nextMidnight(instant, zone)).toISOString();

    // Assert
    expect(midnight).toBe(expected);
  });

  it('repeated requests replace the zone without postponing activation', () => {
    // Arrange
    const now = Date.parse('2026-10-30T12:00:00Z');
    const first = timezoneChange(
      { timezone: 'Europe/Madrid', pendingTimezone: null, timezoneEffectiveAt: null },
      'Asia/Tokyo',
      now,
    );

    // Act
    const second = timezoneChange(first, 'America/New_York', now + 3_600_000);

    // Assert
    expect(second.timezoneEffectiveAt).toBe(first.timezoneEffectiveAt);
    expect(second.pendingTimezone).toBe('America/New_York');
  });

  it('timezoneChange, a later request for the active zone, cancels the pending change', () => {
    // Arrange
    const now = Date.parse('2026-10-30T12:00:00Z');
    const first = timezoneChange(
      { timezone: 'Europe/Madrid', pendingTimezone: null, timezoneEffectiveAt: null },
      'Asia/Tokyo',
      now,
    );
    const second = timezoneChange(first, 'America/New_York', now + 3_600_000);

    // Act
    const cancelled = timezoneChange(second, 'Europe/Madrid', now + 7_200_000);

    // Assert
    expect(cancelled).toEqual({
      timezone: 'Europe/Madrid',
      pendingTimezone: null,
      timezoneEffectiveAt: null,
    });
  });

  it('timezoneChange, at the scheduled instant, applies the pending zone and schedules the next request', () => {
    // Arrange
    const now = Date.parse('2026-10-30T12:00:00Z');
    const first = timezoneChange(
      { timezone: 'Europe/Madrid', pendingTimezone: null, timezoneEffectiveAt: null },
      'Asia/Tokyo',
      now,
    );
    const second = timezoneChange(first, 'America/New_York', now + 3_600_000);
    const effectiveAt = second.timezoneEffectiveAt!;

    // Act
    const applied = timezoneChange(second, 'Asia/Tokyo', effectiveAt);

    // Assert
    expect(applied.timezone).toBe('America/New_York');
    expect(applied.timezoneEffectiveAt).toBeGreaterThan(effectiveAt);
  });

  it.each([
    ['Europe/Madrid', '2026-10-31'],
    ['America/Sao_Paulo', '2026-10-30'],
  ])('localDate, %s at 2026-10-30T23:30:00Z, returns %s', (zone, expected) => {
    // Arrange
    const now = Date.parse('2026-10-30T23:30:00Z');

    // Act
    const date = localDate(now, zone);

    // Assert
    expect(date).toBe(expected);
  });
});

describe('daily streaks', () => {
  it('retains a streak until the current day ends and counts games separately', () => {
    // Arrange
    const events = [{ date: '2026-10-28' }, { date: '2026-10-29' }, { date: '2026-10-29' }];

    // Act
    const activity = dailyActivity(events, '2026-10-30');

    // Assert
    expect(activity).toEqual({ days: { '2026-10-28': 1, '2026-10-29': 2 }, streak: 2 });
  });

  it('dailyActivity, a gap before today, resets the streak', () => {
    // Arrange
    const events = [{ date: '2026-10-28' }];

    // Act
    const activity = dailyActivity(events, '2026-10-30');

    // Assert
    expect(activity.streak).toBe(0);
  });
});
