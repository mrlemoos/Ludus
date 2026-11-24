import {
  appearanceMaterials,
  defaultAppearance,
  finishMaterials,
  finishes,
  materials,
  parseAppearance,
  permittedAppearance,
} from './cosmetics';
import { describe, expect, it } from 'vitest';

describe('cosmetics constants', () => {
  it('materials, catalogue order, matches the recorded snapshot', () => {
    // Arrange
    const catalogue = materials;

    // Act
    const recorded = catalogue;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "wood",
        "walnut",
        "marble",
      ]
    `);
  });

  it('finishes, catalogue order, matches the recorded snapshot', () => {
    // Arrange
    const catalogue = finishes;

    // Act
    const recorded = catalogue;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "wood",
        "ebony",
      ]
    `);
  });

  it('defaultAppearance, opening selection, matches the recorded snapshot', () => {
    // Arrange
    const appearance = defaultAppearance;

    // Act
    const recorded = appearance;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "board": "wood",
        "pieces": "wood",
      }
    `);
  });

  it('appearanceMaterials, board colours, match the recorded snapshot', () => {
    // Arrange
    const catalogue = appearanceMaterials;

    // Act
    const recorded = catalogue;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "marble": {
          "black": "#634734",
          "dark": "#465449",
          "edge": "#303b34",
          "light": "#e4e1d6",
          "roughness": 0.22,
          "white": "#dbb780",
        },
        "walnut": {
          "black": "#634734",
          "dark": "#63432f",
          "edge": "#36271f",
          "light": "#dec8a0",
          "roughness": 0.4,
          "white": "#dbb780",
        },
        "wood": {
          "black": "#634734",
          "dark": "#6c7355",
          "edge": "#5b3929",
          "light": "#d9c59e",
          "roughness": 0.5,
          "white": "#dbb780",
        },
      }
    `);
  });

  it('finishMaterials, piece colours, match the recorded snapshot', () => {
    // Arrange
    const catalogue = finishMaterials;

    // Act
    const recorded = catalogue;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      {
        "ebony": {
          "black": "#292c2c",
          "roughness": 0.24,
          "white": "#eee1c7",
        },
        "wood": {
          "black": "#634734",
          "roughness": 0.36,
          "white": "#dbb780",
        },
      }
    `);
  });
});

describe('free cosmetics', () => {
  it.each([false, true])('permittedAppearance, Plus %s, keeps the saved materials', (plus) => {
    // Arrange
    const selected = { board: 'marble', pieces: 'ebony' } as const;

    // Act
    const appearance = permittedAppearance(selected, plus);

    // Assert
    expect(appearance).toEqual({ board: 'marble', pieces: 'ebony' });
    expect(selected).toEqual({ board: 'marble', pieces: 'ebony' });
  });

  it.each([
    null,
    {},
    { board: 'marble' },
    { board: 'external-url', pieces: 'wood' },
    { board: 'wood', pieces: 'unknown' },
  ])('rejects unsupported appearance %j', (value) => {
    // Arrange
    const input = value;

    // Act
    const appearance = parseAppearance(input);

    // Assert
    expect(appearance).toBeNull();
  });

  it('parseAppearance, a catalogue entry with an extra field, keeps the board and pieces', () => {
    // Arrange
    const value = { board: 'walnut', pieces: 'ebony', owner: 'forged' };

    // Act
    const appearance = parseAppearance(value);

    // Assert
    expect(appearance).toEqual({ board: 'walnut', pieces: 'ebony' });
  });

  it.each(['wood', 'walnut', 'marble'] as const)(
    'appearanceMaterials, %s, uses different light and dark colours',
    (name) => {
      // Arrange
      const material = appearanceMaterials[name];

      // Act
      const distinct = String(material.light) !== String(material.dark);

      // Assert
      expect(distinct).toBe(true);
    },
  );

  it.each(['wood', 'ebony'] as const)(
    'finishMaterials, %s, uses different white and black colours',
    (name) => {
      // Arrange
      const material = finishMaterials[name];

      // Act
      const distinct = String(material.white) !== String(material.black);

      // Assert
      expect(distinct).toBe(true);
    },
  );
});
