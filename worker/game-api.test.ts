import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ session: vi.fn(), handler: vi.fn() }));
vi.mock('./auth', () => ({
  authFor: () => ({ api: { getSession: auth.session }, handler: auth.handler }),
  localDevelopment: () => false,
}));
vi.mock('./guest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./guest')>();
  return {
    ...actual,
    readGuest: vi.fn(async () => null),
  };
});
import { gameApi } from './game-api';

const id = '12345678-1234-1234-1234-123456789abc';
const origin = 'https://ludus.example';
function fixture() {
  const stub = { read: vi.fn(), act: vi.fn(), fetch: vi.fn() };
  const getByName = vi.fn(() => stub);
  return {
    stub,
    getByName,
    env: {
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
      MATCHES: { getByName },
    } as unknown as Env,
  };
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
    // Arrange
    auth.session.mockResolvedValue(null);
    const { env, getByName } = fixture();

    // Act
    const result = await gameApi(request(undefined, { method, headers: { Origin: origin } }), env);

    // Assert
    expect(result.status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('uses the session identity rather than a forged owner header for match reads', async () => {
    // Arrange
    const { env, stub } = fixture();
    stub.read.mockResolvedValue(null);

    // Act
    const result = await gameApi(
      request(undefined, { headers: { 'X-Player': 'another-account' } }),
      env,
    );

    // Assert
    expect(result.status).toBe(404);
    expect(stub.read).toHaveBeenCalledWith('signed-in-owner');
    await expect(result.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('passes action authorisation to the match with authenticated identity', async () => {
    // Arrange
    const { env, stub } = fixture();
    stub.act.mockResolvedValue({ error: 'not_found' });

    // Act
    const result = await gameApi(
      request(undefined, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Player': 'victim' },
        body: JSON.stringify({ type: 'resign', revision: 0, owner: 'victim' }),
      }),
      env,
    );

    // Assert
    expect(result.status).toBe(409);
    expect(stub.act).toHaveBeenCalledWith('signed-in-owner', {
      type: 'resign',
      revision: 0,
      owner: 'victim',
    });
  });

  it('forwards the browser websocket handshake instead of opening a separate socket', async () => {
    // Arrange
    const { env, stub } = fixture();
    stub.fetch.mockResolvedValue(new Response(null, { status: 404 }));
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';

    // Act
    const incoming = request(`/api/games/${id}/socket`, {
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        Cookie: 'ludus_guest=signed-session',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        'X-Player': 'victim',
        'X-Other': 'untrusted',
      },
    });
    const result = await gameApi(incoming, env);

    // Assert
    expect(result.status).toBe(404);
    expect(stub.fetch.mock.calls[0][0]).toBe(incoming);
    const headers = new Headers((stub.fetch.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Upgrade')).toBe('websocket');
    expect(headers.get('Connection')).toBe('Upgrade');
    expect(headers.get('Sec-WebSocket-Key')).toBe(key);
    expect(headers.get('Sec-WebSocket-Version')).toBe('13');
    expect(headers.get('Cookie')).toBe('ludus_guest=signed-session');
    expect(headers.get('X-Player')).toBe('signed-in-owner');
    expect(headers.get('X-Other')).toBeNull();
  });

  it.each<Record<string, string>>([
    { Origin: 'https://attacker.example' },
    { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
  ])('blocks cross-site mutations before reaching match state: %j', async (headers) => {
    // Arrange
    const { env, getByName } = fixture();

    // Act
    const response = await gameApi(request(undefined, { method: 'POST', headers }), env);

    // Assert
    expect(response.status).toBe(403);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('blocks cross-origin socket access', async () => {
    // Arrange
    const { env, stub } = fixture();

    // Act
    const response = await gameApi(
      request(`/api/games/${id}/socket`, { headers: { Origin: 'https://attacker.example' } }),
      env,
    );

    // Assert
    expect(response.status).toBe(403);
    expect(stub.fetch).not.toHaveBeenCalled();
  });

  it('does not provide a separate live review endpoint', async () => {
    // Arrange
    const { env, getByName } = fixture();

    // Act
    const response = await gameApi(request(`/api/games/${id}/review`), env);

    // Assert
    expect(response.status).toBe(404);
    expect(getByName).not.toHaveBeenCalled();
  });

  it('reports persistence failure as unavailable rather than an invalid chess action', async () => {
    // Arrange
    const { env, stub } = fixture();
    stub.act.mockRejectedValue(new Error('D1 unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    const response = await gameApi(
      request(undefined, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'resign', revision: 0 }),
      }),
      env,
    ).finally(() => {
      log.mockRestore();
    });

    // Assert
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' });
  });
});
