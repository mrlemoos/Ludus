import { describe, expect, it } from 'vitest';
import { boundedRequest } from '../../worker/http';
const origin = 'https://ludus.test';
describe('integrated mutation boundary', () => {
  it.each(['POST', 'DELETE'])('blocks cross-site %s before reading the body', async (method) => {
    const response = await boundedRequest(new Request(`${origin}/api/account`, { method, headers: { Origin: 'https://attacker.test' }, body: '{}' }));
    expect(response).toBeInstanceOf(Response); expect((response as Response).status).toBe(403);
  });
  it('caps actual bytes when Content-Length is absent or false', async () => {
    const response = await boundedRequest(new Request(origin, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': '1' }, body: 'x'.repeat(65) }), 64);
    expect((response as Response).status).toBe(413);
  });
  it('preserves a permitted body for downstream independent parsing', async () => {
    const request = await boundedRequest(new Request(origin, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"adult":true}' }));
    expect(request).toBeInstanceOf(Request); expect(await (request as Request).json()).toEqual({ adult: true });
  });
  it('allows public read requests without demanding an Origin header', async () => {
    const request = new Request(origin);
    expect(await boundedRequest(request)).toBe(request);
  });
});
