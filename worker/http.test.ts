import { acknowledgeClose, boundedRequest } from './http';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://ludus.test';
describe('integrated mutation boundary', () => {
  it.each(['POST', 'DELETE'])('blocks cross-site %s before reading the body', async (method) => {
    // Arrange
    const incoming = new Request(`${origin}/api/account`, {
      method,
      headers: { Origin: 'https://attacker.test' },
      body: '{}',
    });

    // Act
    const response = await boundedRequest(incoming);

    // Assert
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });

  it('caps actual bytes when Content-Length is absent or false', async () => {
    // Arrange
    const incoming = new Request(origin, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': '1' },
      body: 'x'.repeat(65),
    });

    // Act
    const response = await boundedRequest(incoming, 64);

    // Assert
    expect((response as Response).status).toBe(413);
  });

  it('preserves a permitted body for downstream independent parsing', async () => {
    // Arrange
    const incoming = new Request(origin, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{"adult":true}',
    });

    // Act
    const request = await boundedRequest(incoming);

    // Assert
    expect(request).toBeInstanceOf(Request);
    await expect((request as Request).json()).resolves.toEqual({ adult: true });
  });

  it('replies to a statusless close without sending an illegal code', () => {
    // Arrange
    const socket = { close: vi.fn() };

    // Act
    acknowledgeClose(socket as unknown as WebSocket, 1006);

    // Assert
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledWith();
  });

  it('keeps a normal close code and falls back when that reply throws', () => {
    // Arrange
    const normal = { close: vi.fn() };
    const refused = {
      close: vi.fn((code?: number) => {
        if (code !== undefined) {
          throw new Error('refused');
        }
      }),
    };

    // Act
    acknowledgeClose(normal as unknown as WebSocket, 1000);
    acknowledgeClose(refused as unknown as WebSocket, 1000);

    // Assert
    expect(normal.close).toHaveBeenCalledWith(1000, 'Closed');
    expect(refused.close).toHaveBeenNthCalledWith(1, 1000, 'Closed');
    expect(refused.close).toHaveBeenNthCalledWith(2);
  });

  it('allows public read requests without demanding an Origin header', async () => {
    // Arrange
    const request = new Request(origin);

    // Act
    const result = await boundedRequest(request);

    // Assert
    expect(result).toBe(request);
  });
});
