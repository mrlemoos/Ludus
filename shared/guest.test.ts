import { guestEmailDomain, isGuestEmail, isGuestUserId } from './guest';
import { describe, expect, it } from 'vitest';

describe('isGuestEmail', () => {
  it('accepts synthetic guest addresses', () => {
    expect(isGuestEmail(`guest+abc${guestEmailDomain}`)).toBe(true);
  });

  it('rejects invited player addresses', () => {
    expect(isGuestEmail('leo@example.com')).toBe(false);
  });

  it('rejects a prefix without the guest domain suffix', () => {
    expect(isGuestEmail('guest+abc@example.com')).toBe(false);
  });
});

describe('isGuestUserId', () => {
  it('accepts guest user ids', () => {
    expect(isGuestUserId('guest_123')).toBe(true);
  });

  it('rejects signed-in user ids', () => {
    expect(isGuestUserId('local-leo')).toBe(false);
  });
});
