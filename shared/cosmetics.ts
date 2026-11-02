export const materials = ['wood', 'walnut', 'marble'] as const;
export const finishes = ['wood', 'ebony'] as const;
export type BoardMaterial = (typeof materials)[number];
export type PieceFinish = (typeof finishes)[number];
export interface Appearance {
  board: BoardMaterial;
  pieces: PieceFinish;
}
export const defaultAppearance: Appearance = { board: 'wood', pieces: 'wood' };
export function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object' || !('board' in value) || !('pieces' in value)) {
    return null;
  }
  return materials.includes(value.board as BoardMaterial) &&
    finishes.includes(value.pieces as PieceFinish)
    ? { board: value.board as BoardMaterial, pieces: value.pieces as PieceFinish }
    : null;
}
export function permittedAppearance(appearance: Appearance, _plus = true): Appearance {
  return { ...appearance };
}
export const appearanceMaterials = {
  wood: {
    light: '#d9c59e',
    dark: '#6c7355',
    edge: '#5b3929',
    roughness: 0.5,
    white: '#dbb780',
    black: '#634734',
  },
  walnut: {
    light: '#dec8a0',
    dark: '#63432f',
    edge: '#36271f',
    roughness: 0.4,
    white: '#dbb780',
    black: '#634734',
  },
  marble: {
    light: '#e4e1d6',
    dark: '#465449',
    edge: '#303b34',
    roughness: 0.22,
    white: '#dbb780',
    black: '#634734',
  },
} as const;
export const finishMaterials = {
  wood: { white: '#dbb780', black: '#634734', roughness: 0.36 },
  ebony: { white: '#eee1c7', black: '#292c2c', roughness: 0.24 },
} as const;
