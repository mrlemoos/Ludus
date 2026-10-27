import { BoxGeometry, BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceSymbol } from 'chess.js';

// Shared geometry keeps a full set at one wooden mesh per piece.
export function createPieceGeometries(): Record<PieceSymbol, BufferGeometry> {
  const lathe = (points: number[][]) => new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), 48);
  const sphere = (radius: number, y: number, x = 0, z = 0) => new SphereGeometry(radius, 24, 16).translate(x, y, z);
  const collar = (radius: number, y: number, thickness = .018) => new TorusGeometry(radius, thickness, 8, 48).rotateX(Math.PI / 2).translate(0, y, 0);
  const base = (radius: number) => lathe([[0, 0], [radius * .88, 0], [radius * .98, .018], [radius, .045], [radius, .075], [radius * .97, .095], [radius * .84, .12], [radius * .82, .145], [radius * .88, .16], [radius * .88, .185], [radius * .77, .21], [0, .21]]);
  const stem = (height: number, width: number) => {
    const curve = new CatmullRomCurve3([new Vector3(width, .2), new Vector3(width * .82, .28), new Vector3(width * .55, height * .7), new Vector3(width * .63, height)]);
    return lathe([[0, .2], ...curve.getPoints(18).map((p) => [p.x, p.y]), [0, height]]);
  };
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
    crown.push(sphere(.041, 1.105, Math.cos(angle) * .215, Math.sin(angle) * .215));
  }
  const battlements: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) battlements.push(new BoxGeometry(.13, .125, .115).translate(0, .94, .218).rotateY(i * Math.PI / 3));
  return {
    p: join([base(.27), stem(.47, .18), collar(.14, .48), sphere(.165, .65)]),
    n: join([base(.31), lathe([[0, .2], [.23, .2], [.22, .29], [.19, .34], [0, .34]]), collar(.22, .28), carve(knight, .21).rotateY(Math.PI / 2)]),
    b: join([base(.3), stem(.7, .21), collar(.205, .71), collar(.17, .76), carve(mitre, .15), sphere(.045, 1.21)]),
    r: join([base(.32), stem(.73, .23), collar(.245, .74), lathe([[0, .76], [.265, .76], [.28, .8], [.28, .9], [.16, .9], [.16, .84], [0, .84]]), ...battlements]),
    q: join([base(.33), stem(.85, .23), collar(.225, .85), collar(.18, .9), lathe([[0, .9], [.15, .9], [.18, .96], [.24, 1.075], [.235, 1.1], [.18, 1.075], [.12, .98], [0, .98]]), ...crown, sphere(.065, 1.14)]),
    k: join([base(.35), stem(.95, .25), collar(.25, .95), collar(.2, 1), lathe([[0, 1], [.19, 1], [.16, 1.1], [.09, 1.14], [0, 1.14]]), new BoxGeometry(.075, .31, .075).translate(0, 1.265, 0), new BoxGeometry(.235, .07, .075).translate(0, 1.3, 0)]),
  };
}
