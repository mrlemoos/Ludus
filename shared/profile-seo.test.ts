import { publicOrigin } from './profile-seo';
import { describe, expect, it } from 'vitest';

describe('profile SEO constants', () => {
  it('publicOrigin, production site, matches the recorded snapshot', () => {
    // Arrange
    const origin = publicOrigin;

    // Act
    const recorded = origin;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`"https://ludus.mrlemoos.dev"`);
  });
});
