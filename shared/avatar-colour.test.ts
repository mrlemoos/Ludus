import { avatarColour } from './avatar-colour';
import { describe, expect, it } from 'vitest';

describe('profile avatar colour', () => {
  it('folds the username hex bytes into red, green and blue', () => {
    expect.assertions(4);
    expect(avatarColour('leo')).toStrictEqual({ background: '#6c656f', foreground: '#f2f5f1' });
    expect(avatarColour('leox')).toStrictEqual({ background: '#e4656f', foreground: '#203b32' });
    expect(avatarColour('Leo').background).not.toBe(avatarColour('leo').background);
    expect(avatarColour('ÿ')).toStrictEqual({ background: '#c3bf00', foreground: '#203b32' });
  }, 1000);
});
