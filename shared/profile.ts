import type { ChessLevel } from './computer';
import { isLanguage } from './waitlist';
import type { Language } from './waitlist';

export const policyVersion = '2026-11-01';
export const teachingProfiles = ['beginner', 'developing', 'club', 'advanced'] as const;
export type TeachingProfile = (typeof teachingProfiles)[number];
export interface PlayerProfile {
  userId: string;
  username: string;
  language: Language;
  timezone: string;
  pendingTimezone: string | null;
  timezoneEffectiveAt: number | null;
  chessLevel: ChessLevel;
  teachingProfile: TeachingProfile;
  activityPublic: boolean;
  adultAttestedAt: number;
  policyVersion: string;
  onboardedAt: number;
  trialExpiresAt: number;
}
export type ProfileInput = Pick<
  PlayerProfile,
  'username' | 'language' | 'timezone' | 'chessLevel' | 'teachingProfile' | 'activityPublic'
>;
export function validTimezone(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function parseProfile(input: unknown): ProfileInput | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const value = input as Record<string, unknown>;
  if (
    value.adult !== true ||
    typeof value.username !== 'string' ||
    !/^[a-zA-Z0-9_]{3,24}$/.test(value.username) ||
    !isLanguage(value.language) ||
    !validTimezone(value.timezone) ||
    !['beginner', 'casual', 'intermediate', 'advanced'].includes(String(value.chessLevel)) ||
    !teachingProfiles.includes(value.teachingProfile as TeachingProfile) ||
    typeof value.activityPublic !== 'boolean'
  ) {
    return null;
  }
  return {
    username: value.username,
    language: value.language,
    timezone: value.timezone,
    chessLevel: value.chessLevel as ChessLevel,
    teachingProfile: value.teachingProfile as TeachingProfile,
    activityPublic: value.activityPublic,
  };
}
export function isOperator(
  user: { id: string; emailVerified?: boolean },
  allowlist: string | undefined,
): boolean {
  return (
    user.emailVerified === true &&
    !!allowlist
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(user.id)
  );
}
export function publicProfile(profile: PlayerProfile) {
  return { username: profile.username, activityPublic: profile.activityPublic };
}
export function invitationEligible(
  invite: { expiresAt: number | null; redeemedBy: string | null } | null,
  userId: string | null,
  now: number,
): boolean {
  return (
    !!invite &&
    ((userId !== null && invite.redeemedBy === userId) ||
      (invite.redeemedBy === null && invite.expiresAt !== null && invite.expiresAt > now))
  );
}
