import { hasPlusAccess } from './plus';
import { describe, expect, it } from 'vitest';

const now = Date.parse('2026-11-01T00:00:00Z');

describe('independent beta and paid Plus access', () => {
  it('keeps complimentary Plus independent of expired beta and suspended paid access', () => {
    // Arrange
    const access = {
      complimentaryPlus: true,
      trialExpiresAt: 0,
      paidAccessUntil: 0,
      paidAccessSuspended: true,
    };

    // Act
    const allowed = hasPlusAccess(access, now);

    // Assert
    expect(allowed).toBe(true);
  });

  it('hasPlusAccess, an active beta with suspended paid access, allows access', () => {
    // Arrange
    const access = { trialExpiresAt: now + 1, paidAccessUntil: now - 1, paidAccessSuspended: true };

    // Act
    const allowed = hasPlusAccess(access, now);

    // Assert
    expect(allowed).toBe(true);
  });

  it('hasPlusAccess, a beta expiring now with suspended paid access, denies access', () => {
    // Arrange
    const access = { trialExpiresAt: now, paidAccessUntil: now + 100, paidAccessSuspended: true };

    // Act
    const allowed = hasPlusAccess(access, now);

    // Assert
    expect(allowed).toBe(false);
  });

  it('hasPlusAccess, paid time remaining after beta, allows access', () => {
    // Arrange
    const access = { trialExpiresAt: now - 1, paidAccessUntil: now + 1 };

    // Act
    const allowed = hasPlusAccess(access, now);

    // Assert
    expect(allowed).toBe(true);
    expect(access).toEqual({ trialExpiresAt: now - 1, paidAccessUntil: now + 1 });
  });

  it('hasPlusAccess, on the exact paid expiry, denies access', () => {
    // Arrange
    const access = { trialExpiresAt: now - 1, paidAccessUntil: now + 1 };

    // Act
    const allowed = hasPlusAccess(access, now + 1);

    // Assert
    expect(allowed).toBe(false);
  });

  it.each([undefined, null, Number.NaN, Infinity, -Infinity, now])(
    'hasPlusAccess, paid deadline %s, denies access',
    (paidAccessUntil) => {
      // Arrange
      const access = { trialExpiresAt: null, paidAccessUntil };

      // Act
      const allowed = hasPlusAccess(access, now);

      // Assert
      expect(allowed).toBe(false);
    },
  );
});
