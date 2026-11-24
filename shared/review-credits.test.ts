import {
  MONTHLY_FREE_REVIEW_CREDITS,
  REVIEW_CREDITS_PER_PACK,
  REVIEW_CREDIT_RESERVATION_TIMEOUT_MS,
  REVIEW_PACK_PRICE_EUR_CENTS,
} from './review-credits';
import { describe, expect, it } from 'vitest';

describe('review credit constants', () => {
  it('REVIEW_CREDITS_PER_PACK, pack size, matches the recorded snapshot', () => {
    // Arrange
    const credits = REVIEW_CREDITS_PER_PACK;

    // Act
    const recorded = credits;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`10`);
  });

  it('REVIEW_PACK_PRICE_EUR_CENTS, pack price, matches the recorded snapshot', () => {
    // Arrange
    const price = REVIEW_PACK_PRICE_EUR_CENTS;

    // Act
    const recorded = price;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`499`);
  });

  it('MONTHLY_FREE_REVIEW_CREDITS, monthly allowance, matches the recorded snapshot', () => {
    // Arrange
    const credits = MONTHLY_FREE_REVIEW_CREDITS;

    // Act
    const recorded = credits;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`30`);
  });

  it('REVIEW_CREDIT_RESERVATION_TIMEOUT_MS, reservation timeout, matches the recorded snapshot', () => {
    // Arrange
    const timeout = REVIEW_CREDIT_RESERVATION_TIMEOUT_MS;

    // Act
    const recorded = timeout;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`90000`);
  });
});
