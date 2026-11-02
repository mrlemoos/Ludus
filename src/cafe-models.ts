import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
export type CafeMaterial = 'wood' | 'leather' | 'brass' | 'plaster' | 'steel' | 'black';
export type CafeModel = { material: CafeMaterial; geometry: BufferGeometry }[];

// Merge by finish once. Every chair instance shares these buffers and materials.
class Model {
  private readonly parts = new Map<CafeMaterial, BufferGeometry[]>();

  add(
    material: CafeMaterial,
    geometry: BufferGeometry,
    at: Point = [0, 0, 0],
    rotation: Point = [0, 0, 0],
    scale: Point = [1, 1, 1],
  ) {
    geometry.applyMatrix4(
      new Matrix4().compose(
        new Vector3(...at),
        new Quaternion().setFromEuler(new Euler(...rotation)),
        new Vector3(...scale),
      ),
    );
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) {
      geometry.dispose();
    }
    // Only position, normal and UV are shared across these geometry types.
    for (const attribute of Object.keys(flat.attributes)) {
      if (!['position', 'normal', 'uv'].includes(attribute)) {
        flat.deleteAttribute(attribute);
      }
    }
    const parts = this.parts.get(material) ?? [];
    parts.push(flat);
    this.parts.set(material, parts);
  }

  box(material: CafeMaterial, at: Point, size: Point, radius = 0) {
    this.add(
      material,
      radius ? new RoundedBoxGeometry(...size, 2, radius) : new BoxGeometry(...size),
      at,
    );
  }

  curve(material: CafeMaterial, points: Point[], radius: number) {
    this.add(
      material,
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        24,
        radius,
        8,
        false,
      ),
    );
  }

  turned(material: CafeMaterial, at: Point, profile: [number, number][]) {
    this.add(
      material,
      new LatheGeometry(
        profile.map(([r, y]) => new Vector2(r, y)),
        20,
      ),
      at,
    );
  }

  finish(): CafeModel {
    return [...this.parts].map(([material, parts]) => {
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => {
        part.dispose();
      });
      geometry.computeBoundingSphere();
      return { material, geometry };
    });
  }
}

function scroll(model: Model, material: CafeMaterial, at: Point, side: number, size: number) {
  const points: Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const angle = t * Math.PI * 2.1;
    const radius = size * (1 - t * 0.88);
    points.push([
      at[0] + side * Math.sin(angle) * radius,
      at[1] - Math.cos(angle) * radius,
      at[2] + Math.sin(t * Math.PI) * 0.025,
    ]);
  }
  model.curve(material, points, size * 0.105);
}

function leaf(model: Model, material: CafeMaterial, at: Point, angle: number, scale = 1) {
  const outline = new Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(-0.025, 0.05, -0.105, 0.08, -0.055, 0.14);
  outline.bezierCurveTo(-0.09, 0.17, -0.035, 0.19, 0, 0.26);
  outline.bezierCurveTo(0.035, 0.19, 0.09, 0.17, 0.055, 0.14);
  outline.bezierCurveTo(0.105, 0.08, 0.025, 0.05, 0, 0);
  model.add(
    material,
    new ExtrudeGeometry(outline, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.012,
      curveSegments: 6,
    }),
    at,
    [0, 0, angle],
    [scale, scale, scale],
  );
}

function chair() {
  const m = new Model();
  for (const x of [-0.235, 0.235]) {
    for (const z of [-0.21, 0.21]) {
      m.turned(
        'wood',
        [x, 0, z],
        [
          [0, 0.02],
          [0.027, 0.02],
          [0.032, 0.04],
          [0.022, 0.07],
          [0.018, 0.22],
          [0.035, 0.27],
          [0.037, 0.3],
          [0.027, 0.33],
          [0.032, 0.46],
          [0, 0.46],
        ],
      );
    }
    m.curve(
      'wood',
      [
        [x, 0.44, -0.23],
        [x * 1.07, 0.72, -0.25],
        [x * 0.96, 0.99, -0.29],
        [x * 0.7, 1.17, -0.28],
      ],
      0.028,
    );
    m.curve(
      'wood',
      [
        [x, 0.69, -0.24],
        [x * 1.22, 0.71, -0.08],
        [x * 1.25, 0.67, 0.2],
        [x * 1.17, 0.64, 0.26],
      ],
      0.025,
    );
    m.turned(
      'wood',
      [x * 1.17, 0.49, 0.19],
      [
        [0, 0],
        [0.018, 0],
        [0.027, 0.025],
        [0.014, 0.08],
        [0.02, 0.15],
        [0, 0.15],
      ],
    );
    m.curve(
      'wood',
      [
        [x, 0.19, -0.21],
        [x, 0.17, 0],
        [x, 0.19, 0.21],
      ],
      0.012,
    );
  }
  m.box('wood', [0, 0.46, 0], [0.57, 0.075, 0.55], 0.025);
  m.box('leather', [0, 0.515, 0.005], [0.53, 0.085, 0.51], 0.038);
  m.box('leather', [0, 0.91, -0.255], [0.43, 0.35, 0.085], 0.04);
  m.curve(
    'wood',
    [
      [-0.24, 1.02, -0.27],
      [-0.19, 1.12, -0.29],
      [0, 1.19, -0.29],
      [0.19, 1.12, -0.29],
      [0.24, 1.02, -0.27],
    ],
    0.036,
  );
  m.curve(
    'wood',
    [
      [-0.23, 0.72, -0.25],
      [0, 0.7, -0.26],
      [0.23, 0.72, -0.25],
    ],
    0.025,
  );
  leaf(m, 'wood', [0, 1.11, -0.255], 0, 0.47);
  for (const side of [-1, 1]) {
    leaf(m, 'wood', [side * 0.075, 1.105, -0.255], -side * 0.8, 0.32);
    for (let i = 0; i < 7; i++) {
      m.add('brass', new SphereGeometry(0.006, 6, 4), [side * 0.19, 0.78 + i * 0.043, -0.207]);
    }
    for (let i = 0; i < 7; i++) {
      m.add('brass', new SphereGeometry(0.006, 6, 4), [
        -0.18 + i * 0.06,
        side === 1 ? 1.05 : 0.77,
        -0.207,
      ]);
    }
  }
  return m.finish();
}

function tableBase() {
  const m = new Model();
  for (const x of [-0.46, 0.46]) {
    for (const z of [-0.34, 0.34]) {
      m.turned(
        'wood',
        [x, 0, z],
        [
          [0, 0.015],
          [0.04, 0.015],
          [0.045, 0.035],
          [0.031, 0.07],
          [0.021, 0.27],
          [0.042, 0.35],
          [0.046, 0.39],
          [0.031, 0.44],
          [0.033, 0.58],
          [0.047, 0.63],
          [0, 0.66],
        ],
      );
    }
  }
  for (const x of [-0.46, 0.46]) {
    m.box('wood', [x, 0.635, 0], [0.055, 0.12, 0.7], 0.008);
  }
  for (const z of [-0.34, 0.34]) {
    m.box('wood', [0, 0.635, z], [0.96, 0.12, 0.055], 0.008);
  }
  return m.finish();
}

function cafeTableBase() {
  const m = new Model();
  m.turned(
    'wood',
    [0, 0, 0],
    [
      [0, 0.035],
      [0.12, 0.035],
      [0.12, 0.07],
      [0.08, 0.1],
      [0.045, 0.18],
      [0.055, 0.25],
      [0.075, 0.28],
      [0.075, 0.32],
      [0.045, 0.36],
      [0.04, 0.55],
      [0.07, 0.61],
      [0.12, 0.66],
      [0.12, 0.71],
      [0, 0.71],
    ],
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    m.curve(
      'wood',
      [
        [0, 0.12, 0],
        [0.12 * Math.cos(angle), 0.14, 0.12 * Math.sin(angle)],
        [0.25 * Math.cos(angle), 0.07, 0.25 * Math.sin(angle)],
        [0.29 * Math.cos(angle), 0.035, 0.29 * Math.sin(angle)],
      ],
      0.025,
    );
  }
  return m.finish();
}

function entranceDoor() {
  const m = new Model();
  for (const side of [-1, 1]) {
    const x = side * 0.37;
    for (const [y, height] of [
      [0.43, 0.5],
      [1.14, 0.7],
      [1.92, 0.56],
    ]) {
      m.box('wood', [x, y, -0.06], [0.6, height, 0.04], 0.01);
      for (const edge of [-1, 1]) {
        m.box('wood', [x + edge * 0.295, y, -0.022], [0.035, height + 0.04, 0.04], 0.008);
        m.box('wood', [x, y + (edge * height) / 2, -0.022], [0.62, 0.035, 0.04], 0.008);
      }
    }
    m.box('brass', [side * 0.09, 1.16, -0.012], [0.045, 0.18, 0.018], 0.014);
    m.curve(
      'brass',
      [
        [side * 0.09, 1.2, 0],
        [side * 0.09, 1.2, 0.04],
        [side * 0.19, 1.2, 0.04],
      ],
      0.012,
    );
    for (const y of [0.35, 1.3, 2.05]) {
      m.turned(
        'brass',
        [side * 0.727, y, -0.025],
        [
          [0, 0],
          [0.012, 0],
          [0.012, 0.09],
          [0, 0.09],
        ],
      );
    }
  }
  m.box('wood', [0, 1.3, -0.035], [0.035, 2.6, 0.045], 0.006);
  m.curve(
    'wood',
    [
      [-0.61, 2.25, -0.02],
      [-0.4, 2.5, -0.02],
      [0, 2.65, -0.02],
      [0.4, 2.5, -0.02],
      [0.61, 2.25, -0.02],
    ],
    0.025,
  );
  return m.finish();
}

function portal() {
  const m = new Model();
  for (const side of [-1, 1]) {
    for (const x of [-0.065, 0, 0.065]) {
      m.turned(
        'plaster',
        [side * 0.84 + x, 0.32, 0.285],
        [
          [0, 0],
          [0.014, 0],
          [0.014, 1.85],
          [0, 1.85],
        ],
      );
    }
    scroll(m, 'plaster', [side * 0.84, 2.49, 0.32], side, 0.14);
    for (let i = 0; i < 3; i++) {
      leaf(
        m,
        'plaster',
        [side * (0.82 + i * 0.055), 2.22 + i * 0.025, 0.335],
        -side * (0.25 + i * 0.4),
        0.65,
      );
    }
    scroll(m, 'plaster', [side * 0.3, 3.25, 0.31], side, 0.21);
    m.curve(
      'plaster',
      [
        [side * 1.05, 3.05, 0.32],
        [side * 0.92, 3.24, 0.33],
        [side * 0.61, 3.42, 0.33],
        [side * 0.23, 3.46, 0.33],
      ],
      0.055,
    );
    for (let i = 0; i < 4; i++) {
      leaf(
        m,
        'plaster',
        [side * (0.3 + i * 0.14), 3.23 - i * 0.055, 0.36],
        -side * (0.6 + i * 0.15),
        0.45,
      );
    }
  }
  m.add('plaster', new SphereGeometry(1, 20, 12), [0, 3.43, 0.32], [0, 0, 0], [0.12, 0.19, 0.055]);
  m.add(
    'plaster',
    new TorusGeometry(0.13, 0.018, 6, 32),
    [0, 3.43, 0.36],
    [0, 0, 0],
    [0.9, 1.4, 1],
  );
  for (let i = -2; i <= 2; i++) {
    leaf(m, 'plaster', [i * 0.035, 2.8, 0.29], -i * 0.24, 0.63);
  }
  return m.finish();
}

function mirror() {
  const m = new Model();
  // Stepped gilt profiles surround a recessed, dark timber rebate.
  for (const side of [-1, 1]) {
    m.box('wood', [side * 0.72, 0, 0], [0.15, 2.35, 0.12]);
    m.box('wood', [0, side * 1.12, 0], [1.6, 0.15, 0.12]);
    for (const offset of [0, 0.04, 0.095]) {
      m.box('brass', [side * (0.655 + offset), 0, 0.075], [0.018, 2.25 + offset * 2, 0.026], 0.007);
      m.box('brass', [0, side * (1.06 + offset), 0.075], [1.32 + offset * 2, 0.018, 0.026], 0.007);
    }
    for (const y of [-1.04, 1.04]) {
      scroll(m, 'brass', [side * 0.76, y, 0.105], side, 0.13);
      for (let i = 0; i < 3; i++) {
        leaf(m, 'brass', [side * 0.7, y - 0.1, 0.095], -side * (0.3 + i * 0.55), 0.6);
      }
    }
    m.curve(
      'brass',
      [
        [side * 0.76, 1.15, 0.04],
        [side * 0.53, 1.3, 0.05],
        [side * 0.27, 1.36, 0.05],
        [0, 1.48, 0.05],
      ],
      0.027,
    );
    scroll(m, 'brass', [side * 0.21, 1.29, 0.08], side, 0.15);
    leaf(m, 'brass', [side * 0.085, 1.37, 0.07], -side * 0.5, 0.5);
  }
  leaf(m, 'brass', [0, 1.36, 0.08], 0, 0.6);
  return m.finish();
}

function espressoMachine() {
  const m = new Model();
  m.box('steel', [0, 0.24, 0], [0.82, 0.38, 0.38], 0.045);
  m.box('black', [0, 0.19, 0.198], [0.72, 0.22, 0.014], 0.006);
  m.box('steel', [0, 0.045, 0.17], [0.84, 0.035, 0.27], 0.012);
  for (let i = 0; i < 16; i++) {
    m.box('black', [-0.36 + i * 0.048, 0.065, 0.19], [0.011, 0.004, 0.2]);
  }
  m.box('brass', [0, 0.43, 0], [0.81, 0.025, 0.36], 0.008);
  for (const x of [-0.24, 0.24]) {
    m.add('steel', new CylinderGeometry(0.05, 0.06, 0.045, 20), [x, 0.225, 0.23]);
    m.box('black', [x, 0.218, 0.34], [0.035, 0.035, 0.19], 0.012);
    m.curve(
      'brass',
      [
        [x, 0.202, 0.23],
        [x, 0.18, 0.25],
        [x + 0.025, 0.17, 0.25],
      ],
      0.008,
    );
    for (const dx of [-0.055, 0, 0.055]) {
      m.add(
        'black',
        new SphereGeometry(0.012, 8, 6),
        [x + dx, 0.34, 0.202],
        [0, 0, 0],
        [1, 1, 0.35],
      );
    }
  }
  m.add(
    'brass',
    new CylinderGeometry(0.043, 0.043, 0.012, 24),
    [0, 0.335, 0.202],
    [Math.PI / 2, 0, 0],
  );
  m.add(
    'plaster',
    new CylinderGeometry(0.034, 0.034, 0.014, 24),
    [0, 0.335, 0.21],
    [Math.PI / 2, 0, 0],
  );
  m.curve(
    'black',
    [
      [0, 0.335, 0.221],
      [0.018, 0.35, 0.221],
    ],
    0.002,
  );
  m.curve(
    'steel',
    [
      [0.36, 0.27, 0.19],
      [0.43, 0.24, 0.24],
      [0.43, 0.11, 0.29],
      [0.4, 0.1, 0.3],
    ],
    0.009,
  );
  for (const x of [-0.33, 0.33]) {
    for (const z of [-0.12, 0.12]) {
      m.box('black', [x, 0.012, z], [0.055, 0.024, 0.055], 0.005);
    }
  }
  return m.finish();
}

export function createCafeModels() {
  return {
    chair: chair(),
    tableBase: tableBase(),
    cafeTableBase: cafeTableBase(),
    entranceDoor: entranceDoor(),
    portal: portal(),
    mirror: mirror(),
    espressoMachine: espressoMachine(),
  };
}
