import { graceMilliseconds } from './billing-lifecycle';
import { liveCatalogue } from './stripe';
import { describe, expect, it } from 'vitest';

describe('billing constants', () => {
  it('records the billing grace period', () => {
    // Arrange

    // Act
    const grace = graceMilliseconds;

    // Assert
    expect(grace).toMatchInlineSnapshot(`604800000`);
  });

  it('records the live Stripe catalogue', () => {
    // Arrange

    // Act
    const catalogue = liveCatalogue;

    // Assert
    expect(catalogue).toMatchInlineSnapshot(`
      {
        "portal": "bpc_1UWeBnBVWchHmktzjD7skdf0",
        "price": "price_1UWeBDBVWchHmktzPeGqPM30",
        "product": "ludus_plus",
      }
    `);
  });
});
