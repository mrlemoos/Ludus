import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, Euler,
  ExtrudeGeometry, LatheGeometry, Matrix4, Quaternion, Shape, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Point = [number, number, number];
export type CafeMaterial = 'wood' | 'leather' | 'brass' | 'plaster' | 'steel' | 'black';
export type CafeModel = { material: CafeMaterial; geometry: BufferGeometry }[];

// Merge by finish once. Every chair instance shares these buffers and materials.
class Model {
  private parts = new Map<CafeMaterial, BufferGeometry[]>();

  add(material: CafeMaterial, geometry: BufferGeometry, at: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]) {
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    // Only position, normal and UV are shared across these geometry types.
    for (const attribute of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(attribute)) flat.deleteAttribute(attribute);
    const parts = this.parts.get(material) ?? [];
    parts.push(flat); this.parts.set(material, parts);
  }

  box(material: CafeMaterial, at: Point, size: Point, radius = 0) {
    this.add(material, radius ? new RoundedBoxGeometry(...size, 2, radius) : new BoxGeometry(...size), at);
  }

  curve(material: CafeMaterial, points: Point[], radius: number) {
    this.add(material, new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 24, radius, 8, false));
  }

  turned(material: CafeMaterial, at: Point, profile: [number, number][]) {
    this.add(material, new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 20), at);
  }

  finish(): CafeModel {
    return [...this.parts].map(([material, parts]) => {
      const geometry = mergeGeometries(parts)!;
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      return { material, geometry };
    });
  }
}

function scroll(model: Model, material: CafeMaterial, at: Point, side: number, size: number) {
  const points: Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, angle = t * Math.PI * 2.1;
    const radius = size * (1 - t * .88);
    points.push([at[0] + side * Math.sin(angle) * radius, at[1] - Math.cos(angle) * radius, at[2] + Math.sin(t * Math.PI) * .025]);
  }
  model.curve(material, points, size * .105);
}

function leaf(model: Model, material: CafeMaterial, at: Point, angle: number, scale = 1) {
  const outline = new Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(-.025, .05, -.105, .08, -.055, .14);
  outline.bezierCurveTo(-.09, .17, -.035, .19, 0, .26);
  outline.bezierCurveTo(.035, .19, .09, .17, .055, .14);
  outline.bezierCurveTo(.105, .08, .025, .05, 0, 0);
  model.add(material, new ExtrudeGeometry(outline, { depth: .012, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .008, bevelThickness: .012, curveSegments: 6 }), at, [0, 0, angle], [scale, scale, scale]);
}

function chair() {
  const m = new Model();
  for (const x of [-.235, .235]) {
    for (const z of [-.21, .21]) {
      m.turned('wood', [x, 0, z], [[0, .02], [.027, .02], [.032, .04], [.022, .07], [.018, .22], [.035, .27], [.037, .3], [.027, .33], [.032, .46], [0, .46]]);
    }
    m.curve('wood', [[x, .44, -.23], [x * 1.07, .72, -.25], [x * .96, .99, -.29], [x * .7, 1.17, -.28]], .028);
    m.curve('wood', [[x, .69, -.24], [x * 1.22, .71, -.08], [x * 1.25, .67, .2], [x * 1.17, .64, .26]], .025);
    m.turned('wood', [x * 1.17, .49, .19], [[0, 0], [.018, 0], [.027, .025], [.014, .08], [.02, .15], [0, .15]]);
    m.curve('wood', [[x, .19, -.21], [x, .17, 0], [x, .19, .21]], .012);
  }
  m.box('wood', [0, .46, 0], [.57, .075, .55], .025);
  m.box('leather', [0, .515, .005], [.53, .085, .51], .038);
  m.box('leather', [0, .91, -.255], [.43, .35, .085], .04);
  m.curve('wood', [[-.24, 1.02, -.27], [-.19, 1.12, -.29], [0, 1.19, -.29], [.19, 1.12, -.29], [.24, 1.02, -.27]], .036);
  m.curve('wood', [[-.23, .72, -.25], [0, .7, -.26], [.23, .72, -.25]], .025);
  leaf(m, 'wood', [0, 1.11, -.255], 0, .47);
  for (const side of [-1, 1]) {
    leaf(m, 'wood', [side * .075, 1.105, -.255], -side * .8, .32);
    for (let i = 0; i < 7; i++) m.add('brass', new SphereGeometry(.006, 6, 4), [side * .19, .78 + i * .043, -.207]);
    for (let i = 0; i < 7; i++) m.add('brass', new SphereGeometry(.006, 6, 4), [-.18 + i * .06, side === 1 ? 1.05 : .77, -.207]);
  }
  return m.finish();
}

function tableBase() {
  const m = new Model();
  for (const x of [-.46, .46]) for (const z of [-.34, .34]) {
    m.turned('wood', [x, 0, z], [[0, .015], [.04, .015], [.045, .035], [.031, .07], [.021, .27], [.042, .35], [.046, .39], [.031, .44], [.033, .58], [.047, .63], [0, .66]]);
  }
  for (const x of [-.46, .46]) m.box('wood', [x, .635, 0], [.055, .12, .7], .008);
  for (const z of [-.34, .34]) m.box('wood', [0, .635, z], [.96, .12, .055], .008);
  return m.finish();
}

function cafeTableBase() {
  const m = new Model();
  m.turned('wood', [0, 0, 0], [[0, .035], [.12, .035], [.12, .07], [.08, .1], [.045, .18], [.055, .25], [.075, .28], [.075, .32], [.045, .36], [.04, .55], [.07, .61], [.12, .66], [.12, .71], [0, .71]]);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + Math.PI / 4;
    m.curve('wood', [[0, .12, 0], [.12 * Math.cos(angle), .14, .12 * Math.sin(angle)], [.25 * Math.cos(angle), .07, .25 * Math.sin(angle)], [.29 * Math.cos(angle), .035, .29 * Math.sin(angle)]], .025);
  }
  return m.finish();
}

function entranceDoor() {
  const m = new Model();
  for (const side of [-1, 1]) {
    const x = side * .37;
    for (const [y, height] of [[.43, .5], [1.14, .7], [1.92, .56]]) {
      m.box('wood', [x, y, -.06], [.6, height, .04], .01);
      for (const edge of [-1, 1]) {
        m.box('wood', [x + edge * .295, y, -.022], [.035, height + .04, .04], .008);
        m.box('wood', [x, y + edge * height / 2, -.022], [.62, .035, .04], .008);
      }
    }
    m.box('brass', [side * .09, 1.16, -.012], [.045, .18, .018], .014);
    m.curve('brass', [[side * .09, 1.2, 0], [side * .09, 1.2, .04], [side * .19, 1.2, .04]], .012);
    for (const y of [.35, 1.3, 2.05]) m.turned('brass', [side * .727, y, -.025], [[0, 0], [.012, 0], [.012, .09], [0, .09]]);
  }
  m.box('wood', [0, 1.3, -.035], [.035, 2.6, .045], .006);
  m.curve('wood', [[-.61, 2.25, -.02], [-.4, 2.5, -.02], [0, 2.65, -.02], [.4, 2.5, -.02], [.61, 2.25, -.02]], .025);
  return m.finish();
}

function portal() {
  const m = new Model();
  for (const side of [-1, 1]) {
    for (const x of [-.065, 0, .065]) m.turned('plaster', [side * .84 + x, .32, .285], [[0, 0], [.014, 0], [.014, 1.85], [0, 1.85]]);
    scroll(m, 'plaster', [side * .84, 2.49, .32], side, .14);
    for (let i = 0; i < 3; i++) leaf(m, 'plaster', [side * (.82 + i * .055), 2.22 + i * .025, .335], -side * (.25 + i * .4), .65);
    scroll(m, 'plaster', [side * .3, 3.25, .31], side, .21);
    m.curve('plaster', [[side * 1.05, 3.05, .32], [side * .92, 3.24, .33], [side * .61, 3.42, .33], [side * .23, 3.46, .33]], .055);
    for (let i = 0; i < 4; i++) leaf(m, 'plaster', [side * (.3 + i * .14), 3.23 - i * .055, .36], -side * (.6 + i * .15), .45);
  }
  m.add('plaster', new SphereGeometry(1, 20, 12), [0, 3.43, .32], [0, 0, 0], [.12, .19, .055]);
  m.add('plaster', new TorusGeometry(.13, .018, 6, 32), [0, 3.43, .36], [0, 0, 0], [.9, 1.4, 1]);
  for (let i = -2; i <= 2; i++) leaf(m, 'plaster', [i * .035, 2.8, .29], -i * .24, .63);
  return m.finish();
}

function mirror() {
  const m = new Model();
  // Stepped gilt profiles surround a recessed, dark timber rebate.
  for (const side of [-1, 1]) {
    m.box('wood', [side * .72, 0, 0], [.15, 2.35, .12]);
    m.box('wood', [0, side * 1.12, 0], [1.6, .15, .12]);
    for (const offset of [0, .04, .095]) {
      m.box('brass', [side * (.655 + offset), 0, .075], [.018, 2.25 + offset * 2, .026], .007);
      m.box('brass', [0, side * (1.06 + offset), .075], [1.32 + offset * 2, .018, .026], .007);
    }
    for (const y of [-1.04, 1.04]) {
      scroll(m, 'brass', [side * .76, y, .105], side, .13);
      for (let i = 0; i < 3; i++) leaf(m, 'brass', [side * .7, y - .1, .095], -side * (.3 + i * .55), .6);
    }
    m.curve('brass', [[side * .76, 1.15, .04], [side * .53, 1.3, .05], [side * .27, 1.36, .05], [0, 1.48, .05]], .027);
    scroll(m, 'brass', [side * .21, 1.29, .08], side, .15);
    leaf(m, 'brass', [side * .085, 1.37, .07], -side * .5, .5);
  }
  leaf(m, 'brass', [0, 1.36, .08], 0, .6);
  return m.finish();
}

function espressoMachine() {
  const m = new Model();
  m.box('steel', [0, .24, 0], [.82, .38, .38], .045);
  m.box('black', [0, .19, .198], [.72, .22, .014], .006);
  m.box('steel', [0, .045, .17], [.84, .035, .27], .012);
  for (let i = 0; i < 16; i++) m.box('black', [-.36 + i * .048, .065, .19], [.011, .004, .2]);
  m.box('brass', [0, .43, 0], [.81, .025, .36], .008);
  for (const x of [-.24, .24]) {
    m.add('steel', new CylinderGeometry(.05, .06, .045, 20), [x, .225, .23]);
    m.box('black', [x, .218, .34], [.035, .035, .19], .012);
    m.curve('brass', [[x, .202, .23], [x, .18, .25], [x + .025, .17, .25]], .008);
    for (const dx of [-.055, 0, .055]) m.add('black', new SphereGeometry(.012, 8, 6), [x + dx, .34, .202], [0, 0, 0], [1, 1, .35]);
  }
  m.add('brass', new CylinderGeometry(.043, .043, .012, 24), [0, .335, .202], [Math.PI / 2, 0, 0]);
  m.add('plaster', new CylinderGeometry(.034, .034, .014, 24), [0, .335, .21], [Math.PI / 2, 0, 0]);
  m.curve('black', [[0, .335, .221], [.018, .35, .221]], .002);
  m.curve('steel', [[.36, .27, .19], [.43, .24, .24], [.43, .11, .29], [.4, .1, .3]], .009);
  for (const x of [-.33, .33]) for (const z of [-.12, .12]) m.box('black', [x, .012, z], [.055, .024, .055], .005);
  return m.finish();
}

export function createCafeModels() {
  return {
    chair: chair(), tableBase: tableBase(), cafeTableBase: cafeTableBase(),
    entranceDoor: entranceDoor(), portal: portal(), mirror: mirror(), espressoMachine: espressoMachine(),
  };
}
