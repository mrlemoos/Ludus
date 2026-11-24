import { guestEmailDomain, isGuestEmail, isGuestUserId } from './guest';
import { describe, expect, it } from 'vitest';

describe('guest identity helpers', () => {
  it('recognises guest emails and ids', () => {
    expect(isGuestEmail(`guest+abc${guestEmailDomain}`)).toBe(true);
    expect(isGuestEmail('leo@example.com')).toBe(false);
    expect(isGuestUserId('guest_123')).toBe(true);
    expect(isGuestUserId('local-leo')).toBe(false);
  });
});
