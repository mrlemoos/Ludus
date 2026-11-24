import { isGuestLimitError } from './game-start';
import grabkit from 'grabkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const grab = grabkit('https://ludus.test', { format: 'json' });

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isGuestLimitError', () => {
  it('recognises a grabkit 403 guest limit', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { error: 'guest_limit_reached' })),
    );

    // Act
    const [, error] = await grab('POST /api/games', {
      body: { colour: 'w', control: '10+5', difficulty: 2 },
    });
    const limited = isGuestLimitError(error);

    // Assert
    expect(limited).toBe(true);
  });

  it('ignores a 403 with another reason', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { error: 'account_deleted' })),
    );

    // Act
    const [, error] = await grab('POST /api/games', {
      body: { colour: 'w', control: '10+5', difficulty: 2 },
    });

    // Assert
    expect(isGuestLimitError(error)).toBe(false);
  });

  it('ignores a transport failure', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    // Act
    const [, error] = await grab('POST /api/games', {
      body: { colour: 'w', control: '10+5', difficulty: 2 },
    });

    // Assert
    expect(isGuestLimitError(error)).toBe(false);
  });
});
