import {
  invitationEligible,
  isOperator,
  parseProfile,
  policyVersion,
  teachingProfiles,
  validTimezone,
} from './profile';
import { describe, expect, it } from 'vitest';

const valid = {
  username: 'Chess_Player',
  language: 'fr-FR',
  timezone: 'Europe/Madrid',
  chessLevel: 'casual',
  teachingProfile: 'developing',
  activityPublic: true,
  adult: true,
};

describe('profile constants', () => {
  it('policyVersion, current policy, matches the recorded snapshot', () => {
    // Arrange
    const version = policyVersion;

    // Act
    const recorded = version;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`"2026-11-01"`);
  });

  it('teachingProfiles, profile catalogue, matches the recorded snapshot', () => {
    // Arrange
    const profiles = teachingProfiles;

    // Act
    const recorded = profiles;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "beginner",
        "developing",
        "club",
        "advanced",
      ]
    `);
  });
});

describe('profile validation', () => {
  it('keeps teaching and computer skill independent', () => {
    // Arrange
    const input = valid;

    // Act
    const profile = parseProfile(input);

    // Assert
    expect(profile).toMatchObject({ chessLevel: 'casual', teachingProfile: 'developing' });
  });

  it.each([
    { adult: false },
    { username: 'ab' },
    { username: '<script>' },
    { language: 'en-US' },
    { timezone: 'Invalid/Timezone' },
    { activityPublic: 'false' },
    { teachingProfile: 'expert' },
    { chessLevel: null },
  ])('rejects invalid fields %j', (patch) => {
    // Arrange
    const input = { ...valid, ...patch };

    // Act
    const profile = parseProfile(input);

    // Assert
    expect(profile).toBeNull();
  });

  it.each(['UTC', 'Europe/Madrid', 'America/Sao_Paulo'])('accepts IANA timezone %s', (zone) => {
    // Arrange
    const candidate = zone;

    // Act
    const accepted = validTimezone(candidate);

    // Assert
    expect(accepted).toBe(true);
  });

  it.each([
    [
      'a verified id listed among operators',
      true,
      { id: 'owner', emailVerified: true },
      'other, owner',
    ],
    ['an unverified id', false, { id: 'owner', emailVerified: false }, 'owner'],
    ['a missing allowlist', false, { id: 'owner', emailVerified: true }, undefined],
    ['a lookalike id', false, { id: 'owner', emailVerified: true }, 'owner-other'],
  ] as const)('isOperator, %s, returns %s', (_condition, allowed, user, allowlist) => {
    // Arrange
    const operator = user;
    const list = allowlist;

    // Act
    const accepted = isOperator(operator, list);

    // Assert
    expect(accepted).toBe(allowed);
  });
});

describe('invitation eligibility', () => {
  it.each([
    ['before the seven-day boundary', true, { expiresAt: 100, redeemedBy: null }, null, 99],
    ['on the seven-day boundary', false, { expiresAt: 100, redeemedBy: null }, null, 100],
    ['the account that redeemed it', true, { expiresAt: 100, redeemedBy: 'owner' }, 'owner', 9999],
    [
      'a different account after redemption',
      false,
      { expiresAt: 100, redeemedBy: 'owner' },
      'other',
      99,
    ],
    ['a missing expiry', false, { expiresAt: null, redeemedBy: null }, null, 0],
  ] as const)(
    'invitationEligible, %s, returns %s',
    (_condition, eligible, invite, userId, instant) => {
      // Arrange
      const invitation = invite;
      const account = userId;

      // Act
      const accepted = invitationEligible(invitation, account, instant);

      // Assert
      expect(accepted).toBe(eligible);
    },
  );
});
