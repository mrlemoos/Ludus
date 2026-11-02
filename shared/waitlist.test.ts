import { isLanguage, parseWaitlist } from './waitlist';
import { describe, expect, it } from 'vitest';

describe('waitlist input', () => {
  it.each(['en-GB', 'es-ES', 'fr-FR'])(
    'accepts %s and normalises email without stripping aliases',
    (language) => {
      expect(parseWaitlist({ email: '  Player+Beta@Example.COM  ', language })).toEqual({
        email: 'player+beta@example.com',
        language,
      });
    },
  );

  it.each([
    null,
    [],
    'player@example.com',
    {},
    { email: 'player@example.com' },
    { email: 12, language: 'en-GB' },
    { email: 'player@example.com', language: 'en-US' },
    ...[
      '',
      'player',
      'player@localhost',
      'a b@example.com',
      '.player@example.com',
      'player.@example.com',
      'a..b@example.com',
      'a@-example.com',
      'a@example-.com',
      'a@example.com\nBcc:other@example.com',
      `${'a'.repeat(65)}@example.com`,
      `a@${'b'.repeat(64)}.com`,
    ].map((email) => ({ email, language: 'en-GB' })),
  ])('rejects invalid data: %j', (input) => {
    expect(parseWaitlist(input)).toBeNull();
  });

  it('rejects email longer than the accepted maximum', () => {
    expect(
      parseWaitlist({
        email: `${'a'.repeat(64)}@${Array(4).fill('b'.repeat(60)).join('.')}.com`,
        language: 'en-GB',
      }),
    ).toBeNull();
  });

  it('only recognises supported locales', () => {
    expect(isLanguage('fr-FR')).toBe(true);
    expect(isLanguage('fr-CA')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
