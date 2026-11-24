import { createPieceGeometries } from './piece-geometry';
import { afterAll, expect, it } from 'vitest';

const pieces = createPieceGeometries();

afterAll(() => {
  for (const geometry of Object.values(pieces)) {
    geometry.dispose();
  }
});

const pieceFits = Object.entries(pieces).map(([symbol, geometry]) => {
  const box = geometry.boundingBox!;
  return {
    symbol,
    triangles: geometry.attributes.position.count / 3,
    minY: box.min.y,
    maxY: box.max.y,
    footprint: Math.max(
      Math.abs(box.min.x),
      Math.abs(box.max.x),
      Math.abs(box.min.z),
      Math.abs(box.max.z),
    ),
  };
});

const pieceAttributes = Object.entries(pieces).flatMap(([symbol, geometry]) =>
  Object.entries(geometry.attributes).map(([attribute, value]) => ({
    symbol,
    attribute,
    values: value.array,
  })),
);

it.each(pieceFits)('$symbol fits its square', ({ triangles, minY, maxY, footprint }) => {
  // Arrange

  // Act
  const bounds = { triangles, minY, maxY, footprint };

  // Assert
  expect(bounds.triangles).toBeLessThan(20_000);
  expect(bounds.minY).toBeGreaterThanOrEqual(-0.001);
  expect(bounds.maxY).toBeLessThan(1.5);
  expect(bounds.footprint).toBeLessThan(0.4);
});

it.each(pieceAttributes)('$symbol $attribute values are finite', ({ values }) => {
  // Arrange

  // Act
  const finite = [...values].every(Number.isFinite);

  // Assert
  expect(finite).toBe(true);
});

it('stacks the king above the queen and the queen above the pawn', () => {
  // Arrange
  const king = pieces.k.boundingBox!;
  const queen = pieces.q.boundingBox!;
  const pawn = pieces.p.boundingBox!;

  // Act
  const heights = [king.max.y, queen.max.y, pawn.max.y];

  // Assert
  expect(heights[0]).toBeGreaterThan(heights[1]);
  expect(heights[1]).toBeGreaterThan(heights[2]);
});
