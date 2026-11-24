import { translator } from './translate';
import { describe, expect, it } from 'vitest';

describe('translator', () => {
  it('returns the British English text for en-GB', () => {
    // Arrange
    const t = translator('en-GB');

    // Act
    const label = t('Join the waitlist');

    // Assert
    expect(label).toBe('Join the waitlist');
  });

  it('returns the Spanish text for es-ES', () => {
    // Arrange
    const t = translator('es-ES');

    // Act
    const label = t('Join the waitlist');

    // Assert
    expect(label).toBe('Apuntarme a la lista');
  });

  it('returns the French text for fr-FR', () => {
    // Arrange
    const t = translator('fr-FR');

    // Act
    const label = t('Join the waitlist');

    // Assert
    expect(label).toBe('Rejoindre la liste d’attente');
  });

  it('falls back to British English for an unknown language', () => {
    // Arrange
    const t = translator('de-DE');

    // Act
    const label = t('Join the waitlist');

    // Assert
    expect(label).toBe('Join the waitlist');
  });
});
