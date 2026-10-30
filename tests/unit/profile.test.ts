import { describe, expect, it } from 'vitest';
import { invitationEligible, isOperator, parseProfile, validTimezone } from '../../shared/profile';
const valid = { username: 'Chess_Player', language: 'fr-FR', timezone: 'Europe/Madrid', chessLevel: 'casual', teachingProfile: 'developing', activityPublic: true, adult: true };
describe('profile validation', () => {
  it('keeps teaching and computer skill independent', () => expect(parseProfile(valid)).toMatchObject({ chessLevel: 'casual', teachingProfile: 'developing' }));
  it.each([{ adult: false }, { username: 'ab' }, { username: '<script>' }, { language: 'en-US' }, { timezone: 'Invalid/Timezone' }, { activityPublic: 'false' }, { teachingProfile: 'expert' }, { chessLevel: null }])('rejects invalid fields %j', (patch) => expect(parseProfile({ ...valid, ...patch })).toBeNull());
  it.each(['UTC', 'Europe/Madrid', 'America/Sao_Paulo'])('accepts IANA timezone %s', (zone) => expect(validTimezone(zone)).toBe(true));
  it('requires explicit verified-ID operator access', () => {
    expect(isOperator({ id: 'owner', emailVerified: true }, 'other, owner')).toBe(true);
    expect(isOperator({ id: 'owner', emailVerified: false }, 'owner')).toBe(false);
    expect(isOperator({ id: 'owner', emailVerified: true }, undefined)).toBe(false);
    expect(isOperator({ id: 'owner', emailVerified: true }, 'owner-other')).toBe(false);
  });
});
describe('invitation eligibility', () => {
  it('expires exactly at seven-day boundary and admits only the redeemed account afterwards', () => {
    expect(invitationEligible({ expiresAt: 100, redeemedBy: null }, null, 99)).toBe(true);
    expect(invitationEligible({ expiresAt: 100, redeemedBy: null }, null, 100)).toBe(false);
    expect(invitationEligible({ expiresAt: 100, redeemedBy: 'owner' }, 'owner', 9999)).toBe(true);
    expect(invitationEligible({ expiresAt: 100, redeemedBy: 'owner' }, 'other', 99)).toBe(false);
    expect(invitationEligible({ expiresAt: null, redeemedBy: null }, null, 0)).toBe(false);
  });
});
