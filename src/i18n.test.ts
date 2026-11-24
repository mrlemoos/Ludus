import { languageNames } from './i18n';
import { expect, it } from 'vitest';

it('records the language names', () => {
  // Arrange

  // Act
  const names = languageNames;

  // Assert
  expect(names).toMatchInlineSnapshot(`
    {
      "en-GB": "English",
      "es-ES": "Español",
      "fr-FR": "Français",
    }
  `);
});
