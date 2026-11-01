import { describe, expect, it } from 'vitest';
import { appearanceMaterials, finishMaterials, parseAppearance, permittedAppearance } from '../../shared/cosmetics';
describe('free cosmetics', () => {
  it('keeps every saved material available regardless of legacy Plus input', () => {
    const selected = { board: 'marble', pieces: 'ebony' } as const;
    expect(permittedAppearance(selected, false)).toEqual(selected);
    expect(permittedAppearance(selected, true)).toEqual(selected);
    expect(selected).toEqual({ board: 'marble', pieces: 'ebony' });
  });
  it.each([null, {}, { board: 'marble' }, { board: 'external-url', pieces: 'wood' }, { board: 'wood', pieces: 'unknown' }])('rejects unsupported appearance %j', (value) => expect(parseAppearance(value)).toBeNull());
  it('accepts only catalogue entries with complete material definitions', () => {
    expect(parseAppearance({ board: 'walnut', pieces: 'ebony', owner: 'forged' })).toEqual({ board: 'walnut', pieces: 'ebony' });
    expect(Object.values(appearanceMaterials).every((m) => String(m.light) !== String(m.dark))).toBe(true);
    expect(Object.values(finishMaterials).every((m) => String(m.white) !== String(m.black))).toBe(true);
  });
});

import { cosmeticsApi } from '../../worker/cosmetics';
import { vi } from 'vitest';
describe('appearance API', () => {
  function environment(expires: number | null) {
    const run = vi.fn();
    const bind = vi.fn((..._args: unknown[]) => ({ first: async () => expires === null ? null : { trial_expires_at: expires }, run }));
    return { env: { DB: { prepare: () => ({ bind }) } } as unknown as Env, bind, run };
  }
  it('requires onboarding', async () => {
    const { env } = environment(null);
    expect((await cosmeticsApi(new Request('https://ludus.test/api/appearance'), env, 'owner')).status).toBe(403);
  });
  it('allows every catalogue material after beta expiry', async () => {
    const { env, run } = environment(Date.now() - 1);
    const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance', { method: 'POST', body: JSON.stringify({ board: 'marble', pieces: 'ebony' }) }), env, 'owner');
    expect(response.status).toBe(200); expect(run).toHaveBeenCalledOnce();
  });
  it('accepts trusted paid access after beta without changing the beta grant', async () => {
    const { env, run } = environment(Date.now() - 1);
    const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance', { method: 'POST', body: JSON.stringify({ board: 'marble', pieces: 'ebony' }) }), env, 'owner', Date.now() + 86400_000);
    expect(response.status).toBe(200); expect(run).toHaveBeenCalledOnce();
  });
  it('loads saved materials after beta expiry', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const run = vi.fn();
      const env = { DB: { prepare: (query: string) => ({ bind: () => ({ first: async () => query.includes('trial_expires_at') ? { trial_expires_at: now } : { board: 'marble', pieces: 'ebony' }, run }) }) } } as unknown as Env;
      const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance'), env, 'owner');
      expect(await response.json()).toEqual({ appearance: { board: 'marble', pieces: 'ebony' } });
      expect(run).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it('writes only authenticated owner and validated catalogue IDs', async () => {
    const { env, bind, run } = environment(Date.now() + 1000);
    const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance', { method: 'POST', body: JSON.stringify({ owner: 'victim', board: 'marble', pieces: 'ebony' }) }), env, 'owner');
    expect(response.status).toBe(200); expect(run).toHaveBeenCalledOnce(); expect(bind).toHaveBeenLastCalledWith('owner', 'marble', 'ebony');
  });
});
