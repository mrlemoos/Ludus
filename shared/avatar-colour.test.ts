import { avatarColour } from './avatar-colour';
import { describe, expect, it } from 'vitest';

describe('profile avatar colour', () => {
  it.each([
    ['leo', { background: '#6c656f', foreground: '#f2f5f1' }],
    ['leox', { background: '#e4656f', foreground: '#203b32' }],
    ['ÿ', { background: '#c3bf00', foreground: '#203b32' }],
  ])('avatarColour, %s, folds the username into %j', (username, colour) => {
    // Arrange
    const name = username;

    // Act
    const avatar = avatarColour(name);

    // Assert
    expect(avatar).toStrictEqual(colour);
  });

  it('avatarColour, a different capitalisation, changes the background', () => {
    // Arrange
    const lowercase = 'leo';
    const capitalised = 'Leo';

    // Act
    const backgrounds = {
      lowercase: avatarColour(lowercase).background,
      capitalised: avatarColour(capitalised).background,
    };

    // Assert
    expect(backgrounds.capitalised).not.toBe(backgrounds.lowercase);
  });
});
