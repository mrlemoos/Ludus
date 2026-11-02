import {
  dailyActivity,
  earnsActivity,
  localDate,
  nextMidnight,
  timezoneChange,
} from './activity';
import { describe, expect, it } from 'vitest';

describe('activity eligibility', () => {
  it.each(['checkmate', 'stalemate'])('always credits %s', (reason) =>{ 
    expect(earnsActivity(reason, 0)).toBe(true); },
  );

  it.each(['resignation', 'timeout', 'agreement', 'material', 'repetition', 'fiftyMoves'])(
    'requires five moves from each player for %s',
    (reason) => {
      expect(earnsActivity(reason, 9)).toBe(false);
      expect(earnsActivity(reason, 10)).toBe(true);
    },
  );

  it.each(['abort', 'aborted', 'review', 'unknown'])('never credits %s', (reason) =>{ 
    expect(earnsActivity(reason, 99)).toBe(false); },
  );
});
describe('player timezones', () => {
  it.each([
    ['2026-03-29T00:00:00Z', 'Europe/Madrid', '2026-03-29T22:00:00.000Z'],
    ['2026-10-25T00:00:00Z', 'Europe/Madrid', '2026-10-25T23:00:00.000Z'],
    ['2026-10-30T00:00:00Z', 'America/Sao_Paulo', '2026-10-30T03:00:00.000Z'],
  ])('finds actual next midnight through DST: %s %s', (now, zone, expected) =>{ 
    expect(new Date(nextMidnight(Date.parse(now), zone)).toISOString()).toBe(expected); },
  );

  it('repeated requests replace the zone without postponing activation', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const first = timezoneChange(
      { timezone: 'Europe/Madrid', pendingTimezone: null, timezoneEffectiveAt: null },
      'Asia/Tokyo',
      now,
    );
    const second = timezoneChange(first, 'America/New_York', now + 3_600_000);
    expect(second.timezoneEffectiveAt).toBe(first.timezoneEffectiveAt);
    expect(second.pendingTimezone).toBe('America/New_York');
    expect(timezoneChange(second, 'Europe/Madrid', now + 7_200_000)).toEqual({
      timezone: 'Europe/Madrid',
      pendingTimezone: null,
      timezoneEffectiveAt: null,
    });
    const applied = timezoneChange(second, 'Asia/Tokyo', second.timezoneEffectiveAt!);
    expect(applied.timezone).toBe('America/New_York');
    expect(applied.timezoneEffectiveAt).toBeGreaterThan(second.timezoneEffectiveAt!);
  });

  it('attributes the same instant to the correct local completion date', () => {
    const now = Date.parse('2026-10-30T23:30:00Z');
    expect(localDate(now, 'Europe/Madrid')).toBe('2026-10-31');
    expect(localDate(now, 'America/Sao_Paulo')).toBe('2026-10-30');
  });
});
describe('daily streaks', () => {
  it('retains a streak until the current day ends and counts games separately', () => {
    expect(
      dailyActivity(
        [{ date: '2026-10-28' }, { date: '2026-10-29' }, { date: '2026-10-29' }],
        '2026-10-30',
      ),
    ).toEqual({ days: { '2026-10-28': 1, '2026-10-29': 2 }, streak: 2 });
    expect(dailyActivity([{ date: '2026-10-28' }], '2026-10-30').streak).toBe(0);
  });
});
