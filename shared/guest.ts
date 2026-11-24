import type { Language } from './waitlist';

export const guestEmailDomain = '@guest.ludus';
export const guestCookieName = 'ludus_guest';
export const guestSessionDays = 7;
export const guestRetentionDays = 30;
export const guestMaxFinishedGames = 10;

export function isGuestEmail(email: string) {
  return email.startsWith('guest+') && email.endsWith(guestEmailDomain);
}

export function isGuestUserId(id: string) {
  return id.startsWith('guest_');
}

export const guestDisplayName: Record<Language, string> = {
  'en-GB': 'Guest',
  'es-ES': 'Invitado',
  'fr-FR': 'Invité',
};
