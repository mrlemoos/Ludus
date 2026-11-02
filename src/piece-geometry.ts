import type { PieceSymbol } from 'chess.js';
import type {
  BufferGeometry} from 'three';
import {
  BoxGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared geometry keeps a full set at one wooden mesh per piece.
export function createPieceGeometries(): Record<PieceSymbol, BufferGeometry> {
  function lathe(points: number[][]) { return new LatheGeometry(
      points.map(([x, y]) => new Vector2(x, y)),
      48,
    ); }
  function sphere(radius: number, y: number, x = 0, z = 0) { return new SphereGeometry(radius, radius < 0.075 ? 12 : 24, radius < 0.075 ? 8 : 16).translate(
      x,
      y,
      z,
    ); }
  function collar(radius: number, y: number, thickness = 0.018) { return new TorusGeometry(radius, thickness, 8, 48).rotateX(Math.PI / 2).translate(0, y, 0); }
  function base(radius: number) { return lathe([
      [0, 0],
      [radius * 0.88, 0],
      [radius, 0.025],
      [radius, 0.065],
      [radius * 0.92, 0.085],
      [radius * 0.8, 0.1],
      [radius * 0.8, 0.125],
      [radius * 0.9, 0.145],
      [radius * 0.9, 0.175],
      [radius * 0.76, 0.195],
      [radius * 0.73, 0.22],
      [0, 0.22],
    ]); }
  function stem(height: number, width: number) {
    const curve = new CatmullRomCurve3([
      new Vector3(width, 0.2),
      new Vector3(width * 0.94, 0.29),
      new Vector3(width * 0.9, 0.38),
      new Vector3(width * 0.46, height * 0.8),
      new Vector3(width * 0.65, height),
    ]);
    return lathe([[0, 0.2], ...curve.getPoints(20).map((p) => [p.x, p.y]), [0, height]]);
  }
  function scroll(points: number[][], thickness = 0.014) { return new TubeGeometry(
      new CatmullRomCurve3(points.map(([x, y, z = 0]) => new Vector3(x, y, z))),
      20,
      thickness,
      6,
      false,
    ); }
  function leaves(radius: number, y: number, count = 8) {
    const leaf = new Shape();
    leaf.moveTo(0, 0);
    leaf.bezierCurveTo(-0.08, 0.035, -0.055, 0.14, 0, 0.205);
    leaf.bezierCurveTo(0.01, 0.135, 0.075, 0.08, 0.035, 0.035);
    leaf.quadraticCurveTo(0.012, 0.07, 0, 0);
    return Array.from({ length: count }, (_, i) =>
      new ExtrudeGeometry(leaf, {
        depth: 0.018,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 2,
        curveSegments: 8,
        steps: 1,
      })
        .translate(0, y, radius)
        .rotateY((i * Math.PI * 2) / count),
    );
  }
  function pearls(radius: number, y: number, count = 12) { return Array.from({ length: count }, (_, i) =>
      sphere(
        0.02,
        y,
        Math.cos((i * Math.PI * 2) / count) * radius,
        Math.sin((i * Math.PI * 2) / count) * radius,
      ),
    ); }
  function twistedStem(height: number, width: number) { return [
    stem(height, width),
    ...Array.from({ length: 6 }, (_, rib) => {
      const points = Array.from({ length: 17 }, (_, i) => {
        const t = i / 16;
        const radius = width * (0.91 - 0.45 * Math.sin((t * Math.PI) / 2));
        const angle = (rib * Math.PI) / 3 + t * Math.PI * 0.8;
        return [Math.cos(angle) * radius, 0.28 + t * (height - 0.29), Math.sin(angle) * radius];
      });
      return scroll(points, 0.012);
    }),
  ]; }
  function join(parts: BufferGeometry[]) {
    const surfaces = parts.map((part) => (part.index ? part.toNonIndexed() : part));
    const geometry = mergeGeometries(surfaces);
    new Set([...parts, ...surfaces]).forEach((part) =>{  part.dispose(); });
    if (!geometry) {throw new Error('Cannot assemble chess piece');}
    geometry.computeBoundingBox();
    return geometry;
  }
  function carve(shape: Shape, depth: number) { return new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      curveSegments: 16,
    }).translate(0, 0, -depth / 2); }
  const knight = new Shape();
  knight.moveTo(-0.19, 0.33);
  knight.bezierCurveTo(-0.24, 0.53, -0.28, 0.79, -0.17, 1.02);
  knight.lineTo(-0.12, 1.14);
  knight.lineTo(-0.045, 1.08);
  knight.lineTo(0.015, 1.16);
  knight.lineTo(0.07, 1.02);
  knight.bezierCurveTo(0.13, 0.98, 0.13, 0.92, 0.2, 0.88);
  knight.lineTo(0.34, 0.78);
  knight.quadraticCurveTo(0.38, 0.73, 0.32, 0.68);
  knight.lineTo(0.19, 0.67);
  knight.lineTo(0.1, 0.73);
  knight.quadraticCurveTo(0.08, 0.61, 0.17, 0.48);
  knight.quadraticCurveTo(0.24, 0.39, 0.22, 0.33);
  knight.closePath();
  const mitre = new Shape();
  mitre.moveTo(0, 0.78);
  mitre.bezierCurveTo(-0.27, 0.84, -0.2, 1.01, 0, 1.2);
  mitre.quadraticCurveTo(0.065, 1.14, 0.105, 1.075);
  mitre.lineTo(-0.025, 0.93);
  mitre.lineTo(0.018, 0.89);
  mitre.lineTo(0.15, 1.02);
  mitre.bezierCurveTo(0.25, 0.88, 0.17, 0.81, 0, 0.78);
  mitre.closePath();
  const crown: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    crown.push(sphere(0.034, 1.14, Math.cos(angle) * 0.225, Math.sin(angle) * 0.225));
    const petal = new Shape();
    petal.moveTo(-0.035, 0.96);
    petal.quadraticCurveTo(-0.07, 1.065, 0, 1.135);
    petal.quadraticCurveTo(0.07, 1.065, 0.035, 0.96);
    petal.closePath();
    crown.push(carve(petal, 0.025).translate(0, 0, 0.19).rotateY(angle));
  }
  const battlements: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const merlon = new Shape();
    merlon.moveTo(-0.055, 0.88);
    merlon.lineTo(-0.075, 1.015);
    merlon.quadraticCurveTo(0, 0.985, 0.075, 1.015);
    merlon.lineTo(0.055, 0.88);
    merlon.closePath();
    battlements.push(
      carve(merlon, 0.08)
        .translate(0, 0, 0.215)
        .rotateY((i * Math.PI) / 3),
    );
  }
  const mane = Array.from({ length: 4 }, (_, i) => {
    const y = 0.48 + i * 0.12;
    return [-1, 1].map((side) =>
      scroll(
        [
          [-0.18, y - 0.04, side * 0.115],
          [-0.25, y, side * 0.12],
          [-0.24, y + 0.07, side * 0.12],
          [-0.17, y + 0.06, side * 0.12],
        ],
        0.021,
      ).rotateY(Math.PI / 2),
    );
  }).flat();
  const arches = Array.from({ length: 4 }, (_, i) =>
    scroll(
      [
        [0.17, 1.04],
        [0.16, 1.16],
        [0.09, 1.23],
        [0, 1.25],
      ],
      0.02,
    ).rotateY((i * Math.PI) / 2),
  );
  return {
    p: join([
      base(0.28),
      ...twistedStem(0.49, 0.18),
      ...leaves(0.15, 0.23, 6),
      collar(0.15, 0.49),
      collar(0.12, 0.535),
      sphere(0.155, 0.69),
      sphere(0.035, 0.85),
    ]),
    n: join([
      base(0.32),
      lathe([
        [0, 0.2],
        [0.23, 0.2],
        [0.24, 0.26],
        [0.2, 0.34],
        [0, 0.34],
      ]),
      ...leaves(0.2, 0.18),
      collar(0.235, 0.26),
      carve(knight, 0.21).rotateY(Math.PI / 2),
      new SphereGeometry(0.1, 16, 12)
        .scale(1, 1.1, 1.45)
        .translate(0.035, 0.86, 0)
        .rotateY(Math.PI / 2),
      new SphereGeometry(0.09, 16, 12)
        .scale(1.1, 0.65, 1.5)
        .translate(0.255, 0.755, 0)
        .rotateY(Math.PI / 2),
      ...mane,
    ]),
    b: join([
      base(0.31),
      ...twistedStem(0.7, 0.21),
      ...leaves(0.18, 0.22),
      collar(0.21, 0.7),
      collar(0.18, 0.75),
      ...pearls(0.17, 0.75),
      carve(mitre, 0.15),
      sphere(0.05, 1.21),
      collar(0.045, 1.205, 0.008),
    ]),
    r: join([
      base(0.33),
      ...twistedStem(0.73, 0.23),
      ...leaves(0.21, 0.22),
      collar(0.245, 0.73),
      collar(0.265, 0.78),
      lathe([
        [0, 0.76],
        [0.265, 0.76],
        [0.28, 0.8],
        [0.28, 0.91],
        [0.16, 0.91],
        [0.16, 0.84],
        [0, 0.84],
      ]),
      ...pearls(0.275, 0.83),
      ...battlements,
    ]),
    q: join([
      base(0.34),
      ...twistedStem(0.85, 0.23),
      ...leaves(0.2, 0.23),
      collar(0.23, 0.85),
      collar(0.19, 0.9),
      ...pearls(0.185, 0.92),
      lathe([
        [0, 0.9],
        [0.15, 0.9],
        [0.19, 0.98],
        [0.235, 1.07],
        [0.23, 1.09],
        [0.18, 1.06],
        [0.12, 0.98],
        [0, 0.98],
      ]),
      ...crown,
      sphere(0.065, 1.11),
      sphere(0.035, 1.2),
    ]),
    k: join([
      base(0.36),
      ...twistedStem(0.94, 0.25),
      ...leaves(0.22, 0.23),
      collar(0.25, 0.94),
      collar(0.2, 0.99),
      ...pearls(0.195, 1.01),
      lathe([
        [0, 1],
        [0.19, 1],
        [0.18, 1.07],
        [0.12, 1.1],
        [0, 1.1],
      ]),
      ...arches,
      sphere(0.055, 1.25),
      new BoxGeometry(0.055, 0.18, 0.055).translate(0, 1.36, 0),
      new BoxGeometry(0.17, 0.05, 0.055).translate(0, 1.38, 0),
      sphere(0.035, 1.45),
      sphere(0.03, 1.38, -0.085),
      sphere(0.03, 1.38, 0.085),
    ]),
  };
}
