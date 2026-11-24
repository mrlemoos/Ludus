import { isLanguage, languages, parseWaitlist } from './waitlist';
import { describe, expect, it } from 'vitest';

describe('waitlist constants', () => {
  it('languages, launch locales, match the recorded snapshot', () => {
    // Arrange
    const locales = languages;

    // Act
    const recorded = locales;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "en-GB",
        "es-ES",
        "fr-FR",
      ]
    `);
  });
});

describe('waitlist input', () => {
  it.each(['en-GB', 'es-ES', 'fr-FR'])(
    'accepts %s and normalises email without stripping aliases',
    (language) => {
      // Arrange
      const input = { email: '  Player+Beta@Example.COM  ', language };

      // Act
      const parsed = parseWaitlist(input);

      // Assert
      expect(parsed).toEqual({ email: 'player+beta@example.com', language });
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
    { email: '', language: 'en-GB' },
    { email: 'player', language: 'en-GB' },
    { email: 'player@localhost', language: 'en-GB' },
    { email: 'a b@example.com', language: 'en-GB' },
    { email: '.player@example.com', language: 'en-GB' },
    { email: 'player.@example.com', language: 'en-GB' },
    { email: 'a..b@example.com', language: 'en-GB' },
    { email: 'a@-example.com', language: 'en-GB' },
    { email: 'a@example-.com', language: 'en-GB' },
    { email: 'a@example.com\nBcc:other@example.com', language: 'en-GB' },
    { email: `${'a'.repeat(65)}@example.com`, language: 'en-GB' },
    { email: `a@${'b'.repeat(64)}.com`, language: 'en-GB' },
  ])('rejects invalid data: %j', (input) => {
    // Arrange
    const value = input;

    // Act
    const parsed = parseWaitlist(value);

    // Assert
    expect(parsed).toBeNull();
  });

  it('rejects email longer than the accepted maximum', () => {
    // Arrange
    const input = {
      email: `${'a'.repeat(64)}@${Array(4).fill('b'.repeat(60)).join('.')}.com`,
      language: 'en-GB',
    };

    // Act
    const parsed = parseWaitlist(input);

    // Assert
    expect(parsed).toBeNull();
  });

  it.each([
    ['fr-FR', true],
    ['fr-CA', false],
    [undefined, false],
  ] as const)('isLanguage, %s, returns %s', (value, expected) => {
    // Arrange
    const candidate = value;

    // Act
    const recognised = isLanguage(candidate);

    // Assert
    expect(recognised).toBe(expected);
  });
});
