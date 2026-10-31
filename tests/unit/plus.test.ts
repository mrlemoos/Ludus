import { describe, expect, it } from 'vitest';
import { hasPlusAccess } from '../../shared/plus';

describe('independent beta and paid Plus access', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');

  it('preserves beta access despite suspended or expired paid access', () => {
    expect(hasPlusAccess({ trialExpiresAt: now + 1, paidAccessUntil: now - 1, paidAccessSuspended: true }, now)).toBe(true);
    expect(hasPlusAccess({ trialExpiresAt: now, paidAccessUntil: now + 100, paidAccessSuspended: true }, now)).toBe(false);
  });

  it('uses the trusted paid deadline after beta ends, including exact expiry', () => {
    const access = { trialExpiresAt: now - 1, paidAccessUntil: now + 1 };
    expect(hasPlusAccess(access, now)).toBe(true);
    expect(hasPlusAccess(access, now + 1)).toBe(false);
    expect(access).toEqual({ trialExpiresAt: now - 1, paidAccessUntil: now + 1 });
  });

  it('does not treat absent or invalid deadlines as permanent access', () => {
    for (const paidAccessUntil of [undefined, null, NaN, Infinity, -Infinity, now]) {
      expect(hasPlusAccess({ trialExpiresAt: null, paidAccessUntil }, now)).toBe(false);
    }
  });
});
