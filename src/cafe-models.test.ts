import { createCafeModels } from './cafe-models';
import { Box3, Vector3 } from 'three';
import { afterAll, describe, expect, it } from 'vitest';

const models = createCafeModels();

afterAll(() =>{ 
  Object.values(models)
    .flat()
    .forEach(({ geometry }) => geometry.dispose()); },
);

describe('café model geometry', () => {
  for (const [name, parts] of Object.entries(models)) {
    it(`${name} has finite, complete meshes that fit its place in the room`, () => {
      const bounds = new Box3();
      for (const { geometry } of parts) {
        const { position, normal, uv } = geometry.attributes;
        expect(position.count).toBeGreaterThan(0);
        expect(position.count % 3).toBe(0);
        expect(normal.count).toBe(position.count);
        expect(uv.count).toBe(position.count);
        for (const attribute of [position, normal, uv])
          {expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);}
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox!);
      }
      // Mirror hangs at 2.2 m; coffee machine stands on the 1.13 m counter.
      bounds.translate(
        new Vector3(0, name === 'mirror' ? 2.2 : (name === 'espressoMachine' ? 1.13 : 0), 0),
      );
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(bounds.max.y).toBeLessThan(3.85);
      expect(bounds.max.x - bounds.min.x).toBeLessThan(2.5);
      expect(bounds.max.z - bounds.min.z).toBeLessThan(0.9);
    });
  }
});
