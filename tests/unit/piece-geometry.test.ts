import { expect, test } from 'vitest';
import { createPieceGeometries } from '../../src/piece-geometry';

test('Baroque pieces fit their squares and keep mesh data finite and bounded', () => {
  const pieces = createPieceGeometries();
  for (const geometry of Object.values(pieces)) {
    const box = geometry.boundingBox!;
    expect(geometry.attributes.position.count / 3).toBeLessThan(20_000);
    expect(box.min.y).toBeGreaterThanOrEqual(-.001);
    expect(box.max.y).toBeLessThan(1.5);
    expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(.4);
    for (const attribute of Object.values(geometry.attributes)) {
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    geometry.dispose();
  }
  expect(pieces.k.boundingBox!.max.y).toBeGreaterThan(pieces.q.boundingBox!.max.y);
  expect(pieces.q.boundingBox!.max.y).toBeGreaterThan(pieces.p.boundingBox!.max.y);
});
