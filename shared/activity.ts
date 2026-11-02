export function localDate(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp);
  function part(name: string) {
    return parts.find((p) => p.type === name)!.value;
  }
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextMidnight(now: number, timezone: string): number {
  const today = localDate(now, timezone);
  let low = Math.floor(now);
  let high = low + 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(middle, timezone) === today) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return high;
}
export function timezoneChange(
  profile: { timezone: string; pendingTimezone: string | null; timezoneEffectiveAt: number | null },
  requested: string,
  now: number,
) {
  const effective = profile.timezoneEffectiveAt !== null && profile.timezoneEffectiveAt <= now;
  const timezone = effective ? (profile.pendingTimezone ?? profile.timezone) : profile.timezone;
  const activation = effective ? null : profile.timezoneEffectiveAt;
  return requested === timezone
    ? { timezone, pendingTimezone: null, timezoneEffectiveAt: null }
    : {
        timezone,
        pendingTimezone: requested,
        timezoneEffectiveAt: activation ?? nextMidnight(now, timezone),
      };
}
export function earnsActivity(reason: string, moves: number): boolean {
  if (reason === 'aborted' || reason === 'abort') {
    return false;
  }
  if (reason === 'checkmate' || reason === 'stalemate') {
    return true;
  }
  return (
    [
      'resignation',
      'timeout',
      'material',
      'repetition',
      'fiftyMoves',
      'agreement',
      'fivefold',
      'seventyFiveMoves',
      'draw',
    ].includes(reason) && moves >= 10
  );
}
export function dailyActivity(events: readonly { date: string }[], today: string) {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.date] = (counts[event.date] ?? 0) + 1;
  }
  function shift(date: string, days: number) {
    return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  }
  let date = counts[today] ? today : shift(today, -1);
  let streak = 0;
  while (counts[date]) {
    streak++;
    date = shift(date, -1);
  }
  return { days: counts, streak };
}
