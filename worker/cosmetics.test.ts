import { describe, expect, it, vi } from 'vitest';

import { cosmeticsApi } from './cosmetics';
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
    const { env } = environment(null);
    expect(
      (await cosmeticsApi(new Request('https://ludus.test/api/appearance'), env, 'owner')).status,
    ).toBe(403);
  });
  it('allows every catalogue material after beta expiry', async () => {
    const { env, run } = environment(Date.now() - 1);
    const response = await cosmeticsApi(
      new Request('https://ludus.test/api/appearance', {
        method: 'POST',
        body: JSON.stringify({ board: 'marble', pieces: 'ebony' }),
      }),
      env,
      'owner',
    );
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });
  it('accepts trusted paid access after beta without changing the beta grant', async () => {
    const { env, run } = environment(Date.now() - 1);
    const response = await cosmeticsApi(
      new Request('https://ludus.test/api/appearance', {
        method: 'POST',
        body: JSON.stringify({ board: 'marble', pieces: 'ebony' }),
      }),
      env,
      'owner',
      Date.now() + 86400_000,
    );
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });
  it('loads saved materials after beta expiry', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
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
      const response = await cosmeticsApi(
        new Request('https://ludus.test/api/appearance'),
        env,
        'owner',
      );
      expect(await response.json()).toEqual({ appearance: { board: 'marble', pieces: 'ebony' } });
      expect(run).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });
  it('writes only authenticated owner and validated catalogue IDs', async () => {
    const { env, bind, run } = environment(Date.now() + 1000);
    const response = await cosmeticsApi(
      new Request('https://ludus.test/api/appearance', {
        method: 'POST',
        body: JSON.stringify({ owner: 'victim', board: 'marble', pieces: 'ebony' }),
      }),
      env,
      'owner',
    );
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(bind).toHaveBeenLastCalledWith('owner', 'marble', 'ebony');
  });
});
