import {
  appearanceMaterials,
  finishMaterials,
  parseAppearance,
  permittedAppearance,
} from './cosmetics';
import { describe, expect, it } from 'vitest';

describe('free cosmetics', () => {
  it('keeps every saved material available regardless of legacy Plus input', () => {
    const selected = { board: 'marble', pieces: 'ebony' } as const;
    expect(permittedAppearance(selected, false)).toEqual(selected);
    expect(permittedAppearance(selected, true)).toEqual(selected);
    expect(selected).toEqual({ board: 'marble', pieces: 'ebony' });
  });

  it.each([
    null,
    {},
    { board: 'marble' },
    { board: 'external-url', pieces: 'wood' },
    { board: 'wood', pieces: 'unknown' },
  ])('rejects unsupported appearance %j', (value) => {
    expect(parseAppearance(value)).toBeNull();
  });

  it('accepts only catalogue entries with complete material definitions', () => {
    expect(parseAppearance({ board: 'walnut', pieces: 'ebony', owner: 'forged' })).toEqual({
      board: 'walnut',
      pieces: 'ebony',
    });
    expect(
      Object.values(appearanceMaterials).every((m) => String(m.light) !== String(m.dark)),
    ).toBe(true);
    expect(Object.values(finishMaterials).every((m) => String(m.white) !== String(m.black))).toBe(
      true,
    );
  });
});
