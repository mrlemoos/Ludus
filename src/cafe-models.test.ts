import { createCafeModels } from './cafe-models';
import type { CafeModel } from './cafe-models';
import { Box3, Vector3 } from 'three';
import { afterAll, describe, expect, it } from 'vitest';

const models = createCafeModels();

afterAll(() => {
  Object.values(models)
    .flat()
    .forEach(({ geometry }) => {
      geometry.dispose();
    });
});

function placedBounds(name: string, parts: CafeModel) {
  const bounds = new Box3();
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox!);
  }
  // Mirror hangs at 2.2 m; coffee machine stands on the 1.13 m counter.
  bounds.translate(
    new Vector3(0, name === 'mirror' ? 2.2 : name === 'espressoMachine' ? 1.13 : 0, 0),
  );
  return bounds;
}

const meshData = Object.entries(models).flatMap(([model, parts]) =>
  parts.map(({ geometry }, index) => ({
    model,
    index,
    triangles: geometry.attributes.position!.count,
    normalCount: geometry.attributes.normal!.count,
    uvCount: geometry.attributes.uv!.count,
  })),
);

const meshAttributes = Object.entries(models).flatMap(([model, parts]) =>
  parts.flatMap(({ geometry }, index) =>
    (['position', 'normal', 'uv'] as const).map((attribute) => ({
      model,
      index,
      attribute,
      values: geometry.attributes[attribute]!.array,
    })),
  ),
);

describe('café model geometry', () => {
  it.each(meshData)(
    '$model mesh $index has complete triangle data',
    ({ triangles, normalCount, uvCount }) => {
      // Arrange

      // Act
      const count = triangles;

      // Assert
      expect(count).toBeGreaterThan(0);
      expect(count % 3).toBe(0);
      expect(normalCount).toBe(count);
      expect(uvCount).toBe(count);
    },
  );

  it.each(meshAttributes)('$model mesh $index $attribute values are finite', ({ values }) => {
    // Arrange

    // Act
    const finite = [...values].every(Number.isFinite);

    // Assert
    expect(finite).toBe(true);
  });

  it.each(Object.keys(models))('%s fits its place in the room', (name) => {
    // Arrange
    const parts = models[name as keyof typeof models];

    // Act
    const bounds = placedBounds(name, parts);

    // Assert
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeLessThan(3.85);
    expect(bounds.max.x - bounds.min.x).toBeLessThan(2.5);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(0.9);
  });
});
