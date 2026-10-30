import { describe, expect, it } from 'vitest';
import { appearanceMaterials, defaultAppearance, finishMaterials, parseAppearance, permittedAppearance } from '../../shared/cosmetics';
describe('cosmetic entitlements', () => {
  it('restores free appearance after expiry without altering a saved selection', () => {
    const selected = { board: 'marble', pieces: 'ebony' } as const;
    expect(permittedAppearance(selected, false)).toEqual(defaultAppearance);
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
  it('denies premium changes after trial expiry before writing', async () => {
    const { env, run } = environment(Date.now() - 1);
    const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance', { method: 'POST', body: JSON.stringify({ board: 'marble', pieces: 'ebony' }) }), env, 'owner');
    expect(response.status).toBe(403); expect(run).not.toHaveBeenCalled();
  });
  it('writes only authenticated owner and validated catalogue IDs', async () => {
    const { env, bind, run } = environment(Date.now() + 1000);
    const response = await cosmeticsApi(new Request('https://ludus.test/api/appearance', { method: 'POST', body: JSON.stringify({ owner: 'victim', board: 'marble', pieces: 'ebony' }) }), env, 'owner');
    expect(response.status).toBe(200); expect(run).toHaveBeenCalledOnce(); expect(bind).toHaveBeenLastCalledWith('owner', 'marble', 'ebony');
  });
});
