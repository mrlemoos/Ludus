import { BoxGeometry, BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceSymbol } from 'chess.js';

// Shared geometry keeps a full set at one wooden mesh per piece.
export function createPieceGeometries(): Record<PieceSymbol, BufferGeometry> {
  const lathe = (points: number[][]) => new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), 48);
  const sphere = (radius: number, y: number, x = 0, z = 0) => new SphereGeometry(radius, radius < .075 ? 12 : 24, radius < .075 ? 8 : 16).translate(x, y, z);
  const collar = (radius: number, y: number, thickness = .018) => new TorusGeometry(radius, thickness, 8, 48).rotateX(Math.PI / 2).translate(0, y, 0);
  const base = (radius: number) => lathe([[0, 0], [radius * .88, 0], [radius, .025], [radius, .065], [radius * .92, .085], [radius * .8, .1], [radius * .8, .125], [radius * .9, .145], [radius * .9, .175], [radius * .76, .195], [radius * .73, .22], [0, .22]]);
  const stem = (height: number, width: number) => {
    const curve = new CatmullRomCurve3([new Vector3(width, .2), new Vector3(width * .94, .29), new Vector3(width * .9, .38), new Vector3(width * .46, height * .8), new Vector3(width * .65, height)]);
    return lathe([[0, .2], ...curve.getPoints(20).map((p) => [p.x, p.y]), [0, height]]);
  };
  const scroll = (points: number[][], thickness = .014) => new TubeGeometry(new CatmullRomCurve3(points.map(([x, y, z = 0]) => new Vector3(x, y, z))), 20, thickness, 6, false);
  const leaves = (radius: number, y: number, count = 8) => {
    const leaf = new Shape();
    leaf.moveTo(0, 0);
    leaf.bezierCurveTo(-.08, .035, -.055, .14, 0, .205);
    leaf.bezierCurveTo(.01, .135, .075, .08, .035, .035);
    leaf.quadraticCurveTo(.012, .07, 0, 0);
    return Array.from({ length: count }, (_, i) => new ExtrudeGeometry(leaf, { depth: .018, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 2, curveSegments: 8, steps: 1 }).translate(0, y, radius).rotateY(i * Math.PI * 2 / count));
  };
  const pearls = (radius: number, y: number, count = 12) => Array.from({ length: count }, (_, i) => sphere(.02, y, Math.cos(i * Math.PI * 2 / count) * radius, Math.sin(i * Math.PI * 2 / count) * radius));
  const twistedStem = (height: number, width: number) => [stem(height, width), ...Array.from({ length: 6 }, (_, rib) => {
    const points = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      const radius = width * (.91 - .45 * Math.sin(t * Math.PI / 2));
      const angle = rib * Math.PI / 3 + t * Math.PI * .8;
      return [Math.cos(angle) * radius, .28 + t * (height - .29), Math.sin(angle) * radius];
    });
    return scroll(points, .012);
  })];
  const join = (parts: BufferGeometry[]) => {
    const surfaces = parts.map((part) => part.index ? part.toNonIndexed() : part);
    const geometry = mergeGeometries(surfaces);
    new Set([...parts, ...surfaces]).forEach((part) => part.dispose());
    if (!geometry) throw new Error('Cannot assemble chess piece');
    geometry.computeBoundingBox();
    return geometry;
  };
  const carve = (shape: Shape, depth: number) => new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 16 }).translate(0, 0, -depth / 2);
  const knight = new Shape();
  knight.moveTo(-.19, .33);
  knight.bezierCurveTo(-.24, .53, -.28, .79, -.17, 1.02);
  knight.lineTo(-.12, 1.14); knight.lineTo(-.045, 1.08);
  knight.lineTo(.015, 1.16); knight.lineTo(.07, 1.02);
  knight.bezierCurveTo(.13, .98, .13, .92, .2, .88);
  knight.lineTo(.34, .78); knight.quadraticCurveTo(.38, .73, .32, .68);
  knight.lineTo(.19, .67); knight.lineTo(.1, .73);
  knight.quadraticCurveTo(.08, .61, .17, .48);
  knight.quadraticCurveTo(.24, .39, .22, .33); knight.closePath();
  const mitre = new Shape();
  mitre.moveTo(0, .78);
  mitre.bezierCurveTo(-.27, .84, -.2, 1.01, 0, 1.2);
  mitre.quadraticCurveTo(.065, 1.14, .105, 1.075);
  mitre.lineTo(-.025, .93); mitre.lineTo(.018, .89); mitre.lineTo(.15, 1.02);
  mitre.bezierCurveTo(.25, .88, .17, .81, 0, .78); mitre.closePath();
  const crown: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    crown.push(sphere(.034, 1.14, Math.cos(angle) * .225, Math.sin(angle) * .225));
    const petal = new Shape();
    petal.moveTo(-.035, .96); petal.quadraticCurveTo(-.07, 1.065, 0, 1.135);
    petal.quadraticCurveTo(.07, 1.065, .035, .96); petal.closePath();
    crown.push(carve(petal, .025).translate(0, 0, .19).rotateY(angle));
  }
  const battlements: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const merlon = new Shape();
    merlon.moveTo(-.055, .88); merlon.lineTo(-.075, 1.015); merlon.quadraticCurveTo(0, .985, .075, 1.015); merlon.lineTo(.055, .88); merlon.closePath();
    battlements.push(carve(merlon, .08).translate(0, 0, .215).rotateY(i * Math.PI / 3));
  }
  const mane = Array.from({ length: 4 }, (_, i) => {
    const y = .48 + i * .12;
    return [-1, 1].map((side) => scroll([[-.18, y - .04, side * .115], [-.25, y, side * .12], [-.24, y + .07, side * .12], [-.17, y + .06, side * .12]], .021).rotateY(Math.PI / 2));
  }).flat();
  const arches = Array.from({ length: 4 }, (_, i) => scroll([[.17, 1.04], [.16, 1.16], [.09, 1.23], [0, 1.25]], .02).rotateY(i * Math.PI / 2));
  return {
    p: join([base(.28), ...twistedStem(.49, .18), ...leaves(.15, .23, 6), collar(.15, .49), collar(.12, .535), sphere(.155, .69), sphere(.035, .85)]),
    n: join([base(.32), lathe([[0, .2], [.23, .2], [.24, .26], [.2, .34], [0, .34]]), ...leaves(.2, .18), collar(.235, .26), carve(knight, .21).rotateY(Math.PI / 2), new SphereGeometry(.1, 16, 12).scale(1, 1.1, 1.45).translate(.035, .86, 0).rotateY(Math.PI / 2), new SphereGeometry(.09, 16, 12).scale(1.1, .65, 1.5).translate(.255, .755, 0).rotateY(Math.PI / 2), ...mane]),
    b: join([base(.31), ...twistedStem(.7, .21), ...leaves(.18, .22), collar(.21, .7), collar(.18, .75), ...pearls(.17, .75), carve(mitre, .15), sphere(.05, 1.21), collar(.045, 1.205, .008)]),
    r: join([base(.33), ...twistedStem(.73, .23), ...leaves(.21, .22), collar(.245, .73), collar(.265, .78), lathe([[0, .76], [.265, .76], [.28, .8], [.28, .91], [.16, .91], [.16, .84], [0, .84]]), ...pearls(.275, .83), ...battlements]),
    q: join([base(.34), ...twistedStem(.85, .23), ...leaves(.2, .23), collar(.23, .85), collar(.19, .9), ...pearls(.185, .92), lathe([[0, .9], [.15, .9], [.19, .98], [.235, 1.07], [.23, 1.09], [.18, 1.06], [.12, .98], [0, .98]]), ...crown, sphere(.065, 1.11), sphere(.035, 1.2)]),
    k: join([base(.36), ...twistedStem(.94, .25), ...leaves(.22, .23), collar(.25, .94), collar(.2, .99), ...pearls(.195, 1.01), lathe([[0, 1], [.19, 1], [.18, 1.07], [.12, 1.1], [0, 1.1]]), ...arches, sphere(.055, 1.25), new BoxGeometry(.055, .18, .055).translate(0, 1.36, 0), new BoxGeometry(.17, .05, .055).translate(0, 1.38, 0), sphere(.035, 1.45), sphere(.03, 1.38, -.085), sphere(.03, 1.38, .085)]),
  };
}
