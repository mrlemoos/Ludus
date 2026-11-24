import {
  guestCookieName,
  guestDisplayName,
  guestEmailDomain,
  guestMaxFinishedGames,
  guestRetentionDays,
  guestSessionDays,
  isGuestEmail,
  isGuestUserId,
} from './guest';
import { describe, expect, it } from 'vitest';

describe('isGuestEmail', () => {
  it('accepts synthetic guest addresses', () => {
    // Arrange
    const email = `guest+abc${guestEmailDomain}`;

    // Act
    const guest = isGuestEmail(email);

    // Assert
    expect(guest).toBe(true);
  });

  it('rejects invited player addresses', () => {
    // Arrange
    const email = 'leo@example.com';

    // Act
    const guest = isGuestEmail(email);

    // Assert
    expect(guest).toBe(false);
  });

  it('rejects a prefix without the guest domain suffix', () => {
    // Arrange
    const email = 'guest+abc@example.com';

    // Act
    const guest = isGuestEmail(email);

    // Assert
    expect(guest).toBe(false);
  });
});

describe('isGuestUserId', () => {
  it('accepts guest user ids', () => {
    // Arrange
    const userId = 'guest_123';

    // Act
    const guest = isGuestUserId(userId);

    // Assert
    expect(guest).toBe(true);
  });

  it('rejects signed-in user ids', () => {
    // Arrange
    const userId = 'local-leo';

    // Act
    const guest = isGuestUserId(userId);

    // Assert
    expect(guest).toBe(false);
  });
});

describe('guest constants', () => {
  it('guest policy constants, current values, match the recorded snapshot', () => {
    // Arrange
    const policy = {
      guestEmailDomain,
      guestCookieName,
      guestSessionDays,
      guestRetentionDays,
      guestMaxFinishedGames,
      guestDisplayName,
    };

    // Act
    const recorded = policy;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "guestCookieName": "ludus_guest",
        "guestDisplayName": {
          "en-GB": "Guest",
          "es-ES": "Invitado",
          "fr-FR": "Invité",
        },
        "guestEmailDomain": "@guest.ludus",
        "guestMaxFinishedGames": 10,
        "guestRetentionDays": 30,
        "guestSessionDays": 7,
      }
    `);
  });
});
