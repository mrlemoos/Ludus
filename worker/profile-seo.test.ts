import { sitemapPageSize } from './profile-seo';
import { describe, expect, it } from 'vitest';

describe('profile SEO constants', () => {
  it('records the sitemap page size', () => {
    // Arrange

    // Act
    const pageSize = sitemapPageSize;

    // Assert
    expect(pageSize).toMatchInlineSnapshot(`1000`);
  });
});
