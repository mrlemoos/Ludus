import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ session: vi.fn(), handler: vi.fn() }));
vi.mock('../../worker/auth', () => ({
  authFor: () => ({ api: { getSession: auth.session }, handler: auth.handler }),
  localDevelopment: () => false,
}));
import { gameApi } from '../../worker/game-api';

const id = '12345678-1234-1234-1234-123456789abc';
const origin = 'https://ludus.example';
function fixture() {
  const stub = { read: vi.fn(), act: vi.fn(), fetch: vi.fn() };
  const getByName = vi.fn(() => stub);
  return { stub, getByName, env: { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }, MATCHES: { getByName } } as unknown as Env };
}
function request(path = `/api/games/${id}`, init?: RequestInit) {
  return new Request(`${origin}${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.session.mockResolvedValue({ user: { id: 'signed-in-owner' } });
});

describe('game API identity boundary', () => {
  it.each(['GET', 'POST'])('requires a session for %s access', async (method) => {
    auth.session.mockResolvedValue(null);
    const { env, getByName } = fixture();
    const result = await gameApi(request(undefined, { method, headers: { Origin: origin } }), env);
    expect(result.status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('uses the session identity rather than a forged owner header for match reads', async () => {
    const { env, stub } = fixture();
    stub.read.mockResolvedValue(null);
    const result = await gameApi(request(undefined, { headers: { 'X-Player': 'another-account' } }), env);
    expect(result.status).toBe(404);
    expect(stub.read).toHaveBeenCalledWith('signed-in-owner');
    expect(await result.json()).toEqual({ error: 'not_found' });
  });

  it('passes action authorisation to the match with authenticated identity', async () => {
    const { env, stub } = fixture();
    stub.act.mockResolvedValue({ error: 'not_found' });
    const result = await gameApi(request(undefined, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Player': 'victim' },
      body: JSON.stringify({ type: 'resign', revision: 0, owner: 'victim' }),
    }), env);
    expect(result.status).toBe(409);
    expect(stub.act).toHaveBeenCalledWith('signed-in-owner', { type: 'resign', revision: 0, owner: 'victim' });
  });

  it('replaces forged socket identity and strips caller-controlled internal headers', async () => {
    const { env, stub } = fixture();
    stub.fetch.mockResolvedValue(new Response(null, { status: 404 }));
    const result = await gameApi(request(`/api/games/${id}/socket`, {
      headers: { Origin: origin, Upgrade: 'websocket', 'X-Player': 'victim', 'X-Other': 'untrusted' },
    }), env);
    expect(result.status).toBe(404);
    const forwarded = stub.fetch.mock.calls[0][0] as Request;
    expect(forwarded.headers.get('X-Player')).toBe('signed-in-owner');
    expect(forwarded.headers.get('X-Other')).toBeNull();
  });

  it.each<Record<string, string>>([
    { Origin: 'https://attacker.example' },
    { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
  ])('blocks cross-site mutations before reaching match state: %j', async (headers) => {
    const { env, getByName } = fixture();
    const response = await gameApi(request(undefined, { method: 'POST', headers }), env);
    expect(response.status).toBe(403);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('blocks cross-origin socket access', async () => {
    const { env, stub } = fixture();
    const response = await gameApi(request(`/api/games/${id}/socket`, { headers: { Origin: 'https://attacker.example' } }), env);
    expect(response.status).toBe(403);
    expect(stub.fetch).not.toHaveBeenCalled();
  });

  it('does not provide a separate live review endpoint', async () => {
    const { env, getByName } = fixture();
    const response = await gameApi(request(`/api/games/${id}/review`), env);
    expect(response.status).toBe(404);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('reports persistence failure as unavailable rather than an invalid chess action', async () => {
    const { env, stub } = fixture();
    stub.act.mockRejectedValue(new Error('D1 unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await gameApi(request(undefined, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'resign', revision: 0 }),
      }), env);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'unavailable' });
    } finally { log.mockRestore(); }
  });
});
