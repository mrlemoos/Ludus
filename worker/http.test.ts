import { boundedRequest } from './http';
import { describe, expect, it } from 'vitest';

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

  it('allows public read requests without demanding an Origin header', async () => {
    // Arrange
    const request = new Request(origin);

    // Act
    const result = await boundedRequest(request);

    // Assert
    expect(result).toBe(request);
  });
});
