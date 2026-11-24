import { cosmeticsApi } from './cosmetics';
import { describe, expect, it, vi } from 'vitest';

describe('appearance API', () => {
  function environment(expires: number | null) {
    const run = vi.fn();
    const bind = vi.fn((..._args: unknown[]) => ({
      first: async () => (expires === null ? null : { trial_expires_at: expires }),
      run,
    }));
    return { env: { DB: { prepare: () => ({ bind }) } } as unknown as Env, bind, run };
  }

  it('requires onboarding', async () => {
    // Arrange
    const { env } = environment(null);

    // Act
    const response = await cosmeticsApi(
      new Request('https://ludus.test/api/appearance'),
      env,
      'owner',
    );

    // Assert
    expect(response.status).toBe(403);
  });

  it('allows every catalogue material after beta expiry', async () => {
    // Arrange
    const { env, run } = environment(Date.now() - 1);
    const request = new Request('https://ludus.test/api/appearance', {
      method: 'POST',
      body: JSON.stringify({ board: 'marble', pieces: 'ebony' }),
    });

    // Act
    const response = await cosmeticsApi(request, env, 'owner');

    // Assert
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });

  it('accepts trusted paid access after beta without changing the beta grant', async () => {
    // Arrange
    const { env, run } = environment(Date.now() - 1);
    const request = new Request('https://ludus.test/api/appearance', {
      method: 'POST',
      body: JSON.stringify({ board: 'marble', pieces: 'ebony' }),
    });
    const paidUntil = Date.now() + 86_400_000;

    // Act
    const response = await cosmeticsApi(request, env, 'owner', paidUntil);

    // Assert
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });

  it('loads saved materials after beta expiry', async () => {
    // Arrange
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const run = vi.fn();
    const env = {
      DB: {
        prepare: (query: string) => ({
          bind: () => ({
            first: async () =>
              query.includes('trial_expires_at')
                ? { trial_expires_at: now }
                : { board: 'marble', pieces: 'ebony' },
            run,
          }),
        }),
      },
    } as unknown as Env;

    // Act
    const response = await cosmeticsApi(
      new Request('https://ludus.test/api/appearance'),
      env,
      'owner',
    ).finally(() => {
      clock.mockRestore();
    });

    // Assert
    await expect(response.json()).resolves.toEqual({
      appearance: { board: 'marble', pieces: 'ebony' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('writes only authenticated owner and validated catalogue IDs', async () => {
    // Arrange
    const { env, bind, run } = environment(Date.now() + 1000);
    const request = new Request('https://ludus.test/api/appearance', {
      method: 'POST',
      body: JSON.stringify({ owner: 'victim', board: 'marble', pieces: 'ebony' }),
    });

    // Act
    const response = await cosmeticsApi(request, env, 'owner');

    // Assert
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(bind).toHaveBeenLastCalledWith('owner', 'marble', 'ebony');
  });
});
