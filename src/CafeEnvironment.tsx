import { createContext, memo, useContext, useEffect, useMemo } from 'react';
import { CubeCamera, ContactShadows, RoundedBox } from '@react-three/drei';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, DoubleSide, Shape, ExtrudeGeometry, BoxGeometry, MeshStandardMaterial, Vector2, Vector3, CubicBezierCurve3, type Texture } from 'three';

type Point = [number, number, number];
const CafeResources = createContext<{ box: BoxGeometry; materials: Map<string, MeshStandardMaterial> } | null>(null);
function Block({ at, size, colour, map, metal = false }: { at: Point; size: Point; colour: string; map?: Texture; metal?: boolean }) {
  const resources = useContext(CafeResources)!;
  const key = `${colour}-${map?.uuid ?? ''}-${metal}`;
  let material = resources.materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({ color: colour, map, bumpMap: map, bumpScale: map ? .004 : 0, roughness: metal ? .35 : .78, metalness: metal ? .65 : 0 });
    resources.materials.set(key, material);
  }
  return <mesh position={at} scale={size} geometry={resources.box} material={material} receiveShadow castShadow dispose={null} />;
}
function Ring({ at, radius, tube, colour, arc = Math.PI * 2, rotation = [0, 0, 0] }: { at: Point; radius: number; tube: number; colour: string; arc?: number; rotation?: Point }) {
  return <mesh position={at} rotation={rotation} castShadow><torusGeometry args={[radius, tube, 6, 32, arc]} /><meshStandardMaterial color={colour} roughness={.65} /></mesh>;
}
const walnut = '#493024', plaster = '#d8c9ad', carving = '#e5d8bd', brass = '#987447';

function surface(kind: 'wood' | 'stone' | 'plaster' | 'floor' | 'ceiling' | 'paper' | 'leather' | 'newsprint') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!;
  let seed = 17;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.fillStyle = kind === 'floor' ? '#b9ad95' : kind === 'ceiling' ? '#b8a17b' : '#eee8dc'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = random() * 256, y = random() * 256;
    c.strokeStyle = `rgba(70,48,30,${random() * (kind === 'wood' ? .13 : .035)})`;
    if (kind === 'wood') {
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 3, y + 12, x - 5, y + 28, x + random() * 6, y + 100); c.stroke();
    } else { c.fillStyle = `rgba(70,48,30,${random() * .05})`; c.fillRect(x, y, 1, 1); }
  }
  if (kind === 'paper') {
    c.fillStyle = '#f4efe4'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++) {
      c.strokeStyle = `rgba(125,112,91,${.025 + random() * .06})`;
      const x = random() * 256, y = random() * 256;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + random() * 5, y + random() * 2); c.stroke();
    }
    c.strokeStyle = '#b9ab9120';
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) {
      c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.stroke();
    }
  }
  if (kind === 'stone') for (let i = 0; i < 14; i++) {
    const x = random() * 256, drift = random() * 60 - 30;
    c.strokeStyle = '#887c6a18'; c.lineWidth = .4 + random() * 1.2;
    c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + drift, 80, x - drift, 175, x, 256); c.stroke();
  }
  c.lineWidth = 1;
  if (kind === 'wood') {
    for (let x = 0; x < 256; x++) {
      const tone = Math.sin(x * .16 + Math.sin(x * .043) * 3);
      c.strokeStyle = `rgba(65,38,19,${.035 + (tone + 1) * .045})`;
      c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 5, 80, x - 5, 170, x, 256); c.stroke();
    }
  }
  if (kind === 'floor') {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = ['#bdb29c', '#c9bda7', '#c5baa3', '#b9af99'][y * 2 + x];
      c.fillRect(x * 128, y * 128, 128, 128);
      const patina = c.createRadialGradient(x * 128 + 64, y * 128 + 64, 18, x * 128 + 64, y * 128 + 64, 90);
      patina.addColorStop(0, '#ffffff0c'); patina.addColorStop(1, '#57473322');
      c.fillStyle = patina; c.fillRect(x * 128, y * 128, 128, 128);
      c.strokeStyle = '#807764'; c.strokeRect(x * 128 + .5, y * 128 + .5, 127, 127);
      c.strokeStyle = '#e5d9bf'; c.strokeRect(x * 128 + 1.5, y * 128 + 1.5, 125, 125);
    }
    for (let y = 0; y <= 256; y += 128) for (let x = 0; x <= 256; x += 128) {
      c.fillStyle = '#55594c'; c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 12, y); c.lineTo(x, y + 12); c.lineTo(x - 12, y); c.closePath(); c.fill();
    }
  }
  if (kind === 'leather') {
    for (let i = 0; i < 5000; i++) {
      c.fillStyle = `rgba(42,25,20,${random() * .16})`;
      c.fillRect(random() * 256, random() * 256, 1, 1);
    }
    c.strokeStyle = '#442a2430';
    for (let x = -256; x <= 512; x += 64) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 256, 256); c.moveTo(x, 0); c.lineTo(x - 256, 256); c.stroke();
    }
  }
  if (kind === 'newsprint') {
    c.fillStyle = '#ddd3b9'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#534c3b'; c.font = 'bold 29px Georgia'; c.textAlign = 'center'; c.fillText('MADRID', 128, 37);
    c.fillRect(14, 46, 228, 2); c.fillRect(14, 52, 228, 1);
    for (let column = 0; column < 3; column++) for (let line = 0; line < 36; line++) {
      c.fillStyle = line < 3 ? '#675e49' : '#8a806a';
      c.fillRect(14 + column * 79, 64 + line * 5, 48 + random() * 22, line < 3 ? 2 : 1);
    }
    c.fillStyle = '#8c7e65'; c.fillRect(94, 85, 69, 54);
    c.fillStyle = '#b8aa8c'; c.fillRect(102, 105, 11, 34); c.fillRect(119, 95, 17, 44); c.fillRect(142, 109, 13, 30);
  }
  if (kind === 'ceiling') {
    c.strokeStyle = '#6f774d80'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse(i * 36, 128, 26, 68, -.5, 0, Math.PI * 2); c.stroke(); }
  }
  if (kind === 'plaster') {
    // Keep wall texture subtle beside carved plaster.
    for (let i = 0; i < 60; i++) {
      const x = random() * 256, y = random() * 256;
      const wash = c.createRadialGradient(x, y, 0, x, y, 40);
      wash.addColorStop(0, '#806c4c08'); wash.addColorStop(1, '#806c4c00');
      c.fillStyle = wash; c.fillRect(0, 0, 256, 256);
    }
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  if (kind === 'floor') texture.repeat.set(7, 10.3 / .9);
  return texture;
}
function Sconce() {
  return <group>
    <mesh position={[0, 0, -.06]} scale={[.11, .21, .035]}><sphereGeometry args={[1, 12, 12]} /><meshStandardMaterial color={brass} metalness={.65} roughness={.35} /></mesh>
    <Ring at={[0, -.04, .08]} radius={.13} tube={.018} colour={brass} arc={Math.PI} rotation={[0, Math.PI / 2, Math.PI]} />
    <mesh position={[0, .19, .2]}><cylinderGeometry args={[.1, .19, .23, 24, 1, true]} /><meshStandardMaterial color="#ead7ae" side={DoubleSide} emissive="#f3bb70" emissiveIntensity={.25} roughness={.9} /></mesh>
    <mesh position={[0, .1, .2]}><sphereGeometry args={[.055, 12, 8]} /><meshStandardMaterial color="#ffe8bd" emissive="#ffc478" emissiveIntensity={2} /></mesh>
    {[.075, .305].map((y, i) => <Ring key={y} at={[0, y, .2]} radius={i ? .1 : .19} tube={.009} colour={brass} rotation={[Math.PI / 2, 0, 0]} />)}
    <pointLight position={[0, .12, .23]} color="#ffd09a" intensity={140} distance={45} decay={2} />
  </group>;
}
function Chair({ at, angle = 0, wood, leather }: { at: Point; angle?: number; wood: Texture; leather: Texture }) {
  return <group position={at} rotation-y={angle}>
    {[-.24, .24].flatMap((x) => [-.22, .22].map((z) => <Block key={`${x}-${z}`} at={[x, .24, z]} size={[.055, .48, .055]} colour={walnut} map={wood} />))}
    <Block at={[0, .46, 0]} size={[.59, .09, .56]} colour={walnut} map={wood} />
    <mesh position={[0, .52, 0]} scale={[1, .23, 1]} castShadow receiveShadow><sphereGeometry args={[.31, 24, 12]} /><meshStandardMaterial color="#592d30" map={leather} bumpMap={leather} bumpScale={.0015} roughness={.52} /></mesh>
    {[-.28, .28].map((x) => <group key={x}><Block at={[x, .78, -.25]} size={[.06, .64, .06]} colour={walnut} map={wood} /><Block at={[x, .7, 0]} size={[.07, .06, .6]} colour="#694c35" map={wood} /></group>)}
    <RoundedBox position={[0, .92, -.25]} args={[.5, .3, .075]} radius={.035} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#592d30" map={leather} bumpMap={leather} bumpScale={.0015} roughness={.52} /></RoundedBox>
    {[-.21, .21].flatMap((x) => [.82, 1.02].map((y) => <mesh key={`${x}-${y}`} position={[x, y, -.207]}><sphereGeometry args={[.008, 8, 6]} /><meshStandardMaterial color={brass} metalness={.6} roughness={.4} /></mesh>))}
    <Ring at={[0, 1.06, -.25]} radius={.28} tube={.035} colour={walnut} arc={Math.PI} />
  </group>;
}
function Cup({ at }: { at: Point }) {
  const profile = useMemo(() => [
    [0, .009], [.037, .009], [.046, .015], [.052, .035], [.061, .077],
    [.065, .103], [.064, .108], [.060, .110], [.056, .107], [.055, .101],
    [.051, .078], [.043, .035], [.035, .023], [0, .023],
  ].map(([radius, height]) => new Vector2(radius, height)), []);
  const handle = useMemo(() => new CubicBezierCurve3(
    new Vector3(.059, .091, 0), new Vector3(.123, .112, 0),
    new Vector3(.123, .026, 0), new Vector3(.047, .036, 0),
  ), []);
  return <group position={at}>
    <mesh receiveShadow><cylinderGeometry args={[.105, .09, .013, 48]} /><meshPhysicalMaterial color="#e8dfca" roughness={.24} clearcoat={.6} /></mesh>
    <mesh castShadow receiveShadow><latheGeometry args={[profile, 64]} /><meshPhysicalMaterial color="#eee5d3" roughness={.2} clearcoat={.8} clearcoatRoughness={.16} /></mesh>
    <CubeCamera position={[0, .094, 0]} frames={1} resolution={64} near={.02} far={600}>
      {(texture) => <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[.0535, 64]} />
        <meshPhysicalMaterial color="#29130a" roughness={.075} metalness={0} ior={1.333} envMap={texture} envMapIntensity={1.4} clearcoat={1} clearcoatRoughness={.04} />
      </mesh>}
    </CubeCamera>
    <mesh castShadow receiveShadow><tubeGeometry args={[handle, 48, .009, 12, false]} /><meshPhysicalMaterial color="#eee5d3" roughness={.2} clearcoat={.8} /></mesh>
    <Block at={[.065, .0105, .04]} size={[.013, .008, .15]} colour={brass} metal />
  </group>;
}
function Doorway({ front = false }: { front?: boolean }) {
  const spandrel = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-.75, 2.05); shape.absarc(0, 2.05, .75, Math.PI, 0, true);
    shape.lineTo(.75, 3.1); shape.lineTo(-.75, 3.1); shape.closePath();
    return new ExtrudeGeometry(shape, { depth: .3, bevelEnabled: false, curveSegments: 20 });
  }, []);
  useEffect(() => () => spandrel.dispose(), [spandrel]);
  return <group position={[.4, 0, front ? 3.5 : -6.5]} scale-z={front ? -1 : 1}>
    <Block at={[-1.325, 2.1, 0]} size={[1.15, 4.2, .3]} colour={plaster} />
    <Block at={[2.575, 2.1, 0]} size={[3.65, 4.2, .3]} colour={plaster} />
    <mesh geometry={spandrel} position-z={-.15} receiveShadow><meshStandardMaterial color={plaster} /></mesh>
    <Block at={[0, 3.65, 0]} size={[1.5, 1.1, .3]} colour={plaster} />
    {[-.84, .84].map((x) => <group key={x}>
      <Block at={[x, 1.2, .12]} size={[.22, 2.4, .3]} colour={carving} />
      <Block at={[x, .14, .2]} size={[.34, .28, .4]} colour={carving} />
      <Block at={[x, 2.35, .23]} size={[.36, .18, .44]} colour={carving} />
      <Block at={[x, 1.3, .3]} size={[.09, 1.85, .08]} colour={plaster} />
      <Ring at={[x, 2.56, .25]} radius={.15} tube={.055} colour={carving} arc={Math.PI * 1.7} />
    </group>)}
    {[-1, 1].flatMap((side) => [0, 1, 2].map((i) => <mesh key={`${side}-${i}`} position={[side * (.78 + i * .06), 2.48 + i * .045, .3]} rotation-z={side * (.3 + i * .4)} scale={[.045, .15, .035]} castShadow><sphereGeometry args={[1, 8, 8]} /><meshStandardMaterial color={carving} /></mesh>))}
    {[.76, .85, .95].map((r) => <Ring key={r} at={[0, 2.05, .16]} radius={r} tube={.055} colour={carving} arc={Math.PI} />)}
    <Block at={[0, 3.02, .15]} size={[2.25, .12, .48]} colour={carving} />
    {[-1, 1].map((side) => <Ring key={side} at={[0, 3.02, .19]} radius={1.05} tube={.085} colour={carving} arc={1.05} rotation={[0, 0, side === 1 ? 0 : Math.PI - 1.05]} />)}
    <mesh position={[0, 3.5, .23]} scale={[.15, .23, .07]} castShadow><sphereGeometry args={[1, 12, 12]} /><meshStandardMaterial color={carving} /></mesh>
    {front && <Block at={[0, 1.55, -.12]} size={[1.5, 3.1, .08]} colour={walnut} />}
  </group>;
}

export const CafeEnvironment = memo(function CafeEnvironment({ lowQuality }: { lowQuality: boolean }) {
  const resources = useMemo(() => ({ box: new BoxGeometry(1, 1, 1), materials: new Map<string, MeshStandardMaterial>() }), []);
  useEffect(() => () => { resources.box.dispose(); resources.materials.forEach((material) => material.dispose()); }, [resources]);
  const maps = useMemo(() => ({ wood: surface('wood'), stone: surface('stone'), plaster: surface('plaster'), floor: surface('floor'), ceiling: surface('ceiling'), paper: surface('paper'), leather: surface('leather'), newsprint: surface('newsprint') }), []);
  useEffect(() => () => Object.values(maps).forEach((map) => map.dispose()), [maps]);
  return <CafeResources.Provider value={resources}><group position={[0, -15.4, 0]} scale={20}>
    <mesh position={[1.65, -.04, -1.5]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[6.3, 10.3]} /><meshStandardMaterial map={maps.floor} roughness={.85} /></mesh>
    <Block at={[1.65, 4.27, -1.5]} size={[6.3, .14, 10.3]} colour="#ddd1b6" map={maps.plaster} />
    <Block at={[4.8, 2.1, -1.5]} size={[.3, 4.2, 10.3]} colour={plaster} map={maps.plaster} />
    <Block at={[-1.5, .5, -1.5]} size={[.3, 1, 10.3]} colour={plaster} />
    <Block at={[-1.5, 4.02, -1.5]} size={[.3, .36, 10.3]} colour={plaster} />
    {[[-5.55, 1.9], [-1.8, 1.6], [2.25, 2.5]].map(([z, depth]) => <Block key={z} at={[-1.5, 2.4, z]} size={[.3, 2.8, depth]} colour={plaster} map={maps.plaster} />)}
    {[-3.6, 0].map((z) => <group key={z} position={[-1.35, 0, z]} rotation-y={Math.PI / 2}>
      {[-1.04, 1.04].map((x) => <Block key={x} at={[x, 2.4, -.075]} size={[.13, 2.95, .45]} colour={carving} />)}
      {[-1.15, 1.15].map((x) => <Block key={x} at={[x, 2.4, .08]} size={[.075, 3.05, .08]} colour={carving} />)}
      <Block at={[0, .99, -.075]} size={[2.25, .12, .55]} colour="#c8bba3" map={maps.stone} />
      <Block at={[0, 3.85, -.075]} size={[2.25, .14, .45]} colour={carving} />
      <Block at={[0, 3.96, .025]} size={[2.5, .08, .2]} colour={carving} />
      {[-.51, .51].map((x) => <Block key={x} at={[x, 3.1, -.2]} size={[.025, 1.35, .045]} colour={walnut} map={maps.wood} />)}
      {[-.95, 0, .95].map((x) => <Block key={x} at={[x, 2.4, -.23]} size={[.045, 2.8, .06]} colour={walnut} />)}
      {[1.05, 2.4, 3.8].map((y) => <Block key={y} at={[0, y, -.23]} size={[1.95, .055, .06]} colour={walnut} />)}
      {[-.85, -.55, -.25, .05, .35, .65, .9].map((x) => <Block key={x} at={[x, 1.35, -.55]} size={[.016, .65, .02]} colour="#393a35" metal />)}
      <Block at={[0, 1.68, -.55]} size={[2, .025, .035]} colour="#393a35" metal />
    </group>)}
    <Doorway /><Doorway front />
    {/* Second room closes the doorway sightline, including oblique views. */}
    <Block at={[1.65, 2.1, -9]} size={[6.3, 4.2, .2]} colour="#ad9679" />
    {[-1.5, 4.8].map((x) => <Block key={x} at={[x, 2.1, -7.8]} size={[.3, 4.2, 2.6]} colour={plaster} />)}
    <Block at={[1.65, -.04, -7.8]} size={[6.3, .08, 2.6]} colour="#a99d85" />
    <Block at={[1.65, 4.25, -7.8]} size={[6.3, .1, 2.6]} colour={plaster} />
    <group position={[.4, 0, -8.85]}>
      <Block at={[0, .52, 0]} size={[2.5, 1.04, .08]} colour={walnut} map={maps.wood} />
      <Block at={[0, 1.06, .04]} size={[2.6, .06, .15]} colour={walnut} />
      <Block at={[0, .73, .65]} size={[.85, .06, .65]} colour="#c8bba3" map={maps.stone} />
      <Block at={[0, .36, .65]} size={[.09, .72, .09]} colour={walnut} />
      <group position={[0, 2.1, .12]}><Sconce /></group>
    </group>
    {/* Continuous rails and cornices turn all four corners. */}
    {[-1.33, 4.63].map((x) => <group key={x}>
      <Block at={[x, .5, -1.5]} size={[.08, 1, 10]} colour={walnut} map={maps.wood} />
      {[.1, .96, 1.05, 3.85, 3.99, 4.12].map((y, i) => <Block key={y} at={[x, y, -1.5]} size={[i > 2 ? .15 + (i - 3) * .09 : .12, i > 2 ? .12 : .045, 10]} colour={i > 2 ? carving : walnut} />)}
      <mesh position={[x, 3.94, -1.5]} rotation-x={Math.PI / 2}><cylinderGeometry args={[.14, .14, 10, 8]} /><meshStandardMaterial color={carving} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <Block key={i} at={[x === -1.33 ? x + .06 : x - .06, .5, -6.05 + i * .83]} size={[.035, .72, .65]} colour="#60412e" map={maps.wood} />)}
      <Block at={[x === -1.33 ? x + .22 : x - .22, 4.18, -1.5]} size={[.3, .02, 9.6]} colour="#c8b089" map={maps.ceiling} />
    </group>)}
    {[-6.32, 3.32].map((z) => <group key={z}>
      {[3.85, 3.99, 4.12].map((y, i) => <Block key={y} at={[1.65, y, z]} size={[6, .12, .15 + i * .09]} colour={carving} />)}
      <Block at={[1.65, 4.18, z]} size={[5.6, .02, .3]} colour="#c8b089" map={maps.ceiling} />
      {[-.9, 2.8].map((x) => <group key={x}><Block at={[x, .5, z]} size={[x < 0 ? .8 : 3.6, 1, .08]} colour={walnut} map={maps.wood} /><Block at={[x, 1.05, z]} size={[x < 0 ? .8 : 3.6, .06, .13]} colour={walnut} /></group>)}
    </group>)}
    <Ring at={[1.65, 4.17, -1.5]} radius={.6} tube={.04} colour={carving} rotation={[Math.PI / 2, 0, 0]} />
    {[.42, .5, .68].map((radius) => <Ring key={radius} at={[1.65, 4.17, -1.5]} radius={radius} tube={.018} colour={carving} rotation={[Math.PI / 2, 0, 0]} />)}
    {[-4.4, 1.85].map((z) => <group key={z} position={[4.59, 2.35, z]} rotation-y={-Math.PI / 2}>
      {[-.69, .69].map((x) => <Block key={x} at={[x, 0, 0]} size={[.035, 1.9, .035]} colour={carving} />)}
      {[-.95, .95].map((y) => <Block key={y} at={[0, y, 0]} size={[1.4, .035, .035]} colour={carving} />)}
      <Sconce />
    </group>)}
    {/* Facing street, pavement and balconies beyond the actual window openings. */}
    <Block at={[-3.5, -.08, -1.5]} size={[4, .12, 60]} colour="#8f8a7e" />
    <Block at={[-6, 3.5, -1.5]} size={[.4, 9, 60]} colour="#b08257" map={maps.plaster} />
    {Array.from({ length: 19 }, (_, i) => -27 + i * 3).flatMap((z) => [1.8, 4.5, 7.2].map((y) => <group key={`${z}-${y}`}>
      <Block at={[-5.76, y, z]} size={[.08, 1.75, 1.1]} colour="#454e49" />
      <Block at={[-5.7, y - .92, z]} size={[.3, .12, 1.35]} colour="#d7b78b" />
      <Block at={[-5.5, y - .5, z]} size={[.025, .03, 1.4]} colour="#333732" />
      {[-.6, -.3, 0, .3, .6].map((dz) => <Block key={dz} at={[-5.5, y - .7, z + dz]} size={[.025, .45, .025]} colour="#333732" />)}
    </group>))}
    {/* Playing table, top at 0.75 m, board geometry unchanged above it. */}
    <RoundedBox position={[0, .724, 0]} args={[1.15, .052, .9]} radius={.018} smoothness={2} receiveShadow><meshStandardMaterial color="#c8bba3" map={maps.stone} roughness={.65} /></RoundedBox>
    <Block at={[0, .66, 0]} size={[1.05, .09, .8]} colour={walnut} map={maps.wood} />
    {[-.46, .46].flatMap((x) => [-.34, .34].map((z) => <Block key={`${x}-${z}`} at={[x, .32, z]} size={[.065, .64, .065]} colour={walnut} map={maps.wood} />))}
    <ContactShadows position={[1.65, .008, -1.5]} frames={1} opacity={.35} scale={10} blur={2} far={1.3} resolution={lowQuality ? 128 : 256} />
    <Chair at={[0, 0, -.94]} angle={-.14} wood={maps.wood} leather={maps.leather} /><Chair at={[0, 0, 1]} angle={Math.PI} wood={maps.wood} leather={maps.leather} />
    <Cup at={[.43, .7565, .19]} /><RoundedBox position={[.43, .752, -.04]} args={[.09, .003, .17]} radius={.0012} smoothness={2} receiveShadow castShadow>
      <meshStandardMaterial color="#f4efe4" map={maps.paper} bumpMap={maps.paper} bumpScale={.0005} roughness={1} />
    </RoundedBox>
    {[-3.7, 1.65].map((z) => <group key={z} position={[2.8, 0, z]}>
      <Block at={[0, .73, 0]} size={[.85, .05, .8]} colour="#c8bba3" map={maps.stone} />
      <Block at={[0, .36, 0]} size={[.1, .72, .1]} colour={walnut} /><Block at={[0, .05, 0]} size={[.6, .06, .5]} colour={walnut} />
      <Chair at={[-.7, 0, 0]} angle={-Math.PI / 2} wood={maps.wood} leather={maps.leather} />
      <mesh position={[0, .762, 0]} rotation={[-Math.PI / 2, 0, -.15]} receiveShadow><planeGeometry args={[.3, .4]} /><meshStandardMaterial map={maps.newsprint} roughness={1} /></mesh>
      <Block at={[.015, .758, -.005]} size={[.31, .004, .4]} colour="#c5baa0" />
    </group>)}
    <Block at={[4.24, .27, -1]} size={[.7, .54, 6.8]} colour={walnut} map={maps.wood} />
    <Block at={[4.5, .83, -1]} size={[.25, .8, 6.8]} colour={walnut} map={maps.wood} />
    {[-3.8, -2.7, -1.6, -.5, .6, 1.7].map((z) => <group key={z}>
      <RoundedBox position={[4.16, .56, z]} args={[.65, .15, 1.05]} radius={.045} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#592d30" map={maps.leather} bumpMap={maps.leather} bumpScale={.0015} roughness={.52} /></RoundedBox>
      <RoundedBox position={[4.34, .96, z]} args={[.13, .63, 1.05]} radius={.045} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#592d30" map={maps.leather} bumpMap={maps.leather} bumpScale={.0015} roughness={.52} /></RoundedBox>
      {[-.25, .25].map((dz) => <mesh key={dz} position={[4.266, 1, z + dz]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.014, .014, .01, 8]} /><meshStandardMaterial color="#391e20" roughness={.5} /></mesh>)}
    </group>)}
    <Block at={[3.25, .53, -5.35]} size={[2.4, 1.06, .72]} colour={walnut} map={maps.wood} />
    <Block at={[3.25, 1.09, -5.35]} size={[2.5, .08, .84]} colour="#c8bba3" map={maps.stone} />
    {[2.45, 3.25, 4.05].map((x) => <group key={x}>
      <Block at={[x, .53, -4.977]} size={[.68, .77, .035]} colour="#76543a" map={maps.wood} />
      <Block at={[x, .53, -4.95]} size={[.57, .65, .025]} colour={walnut} map={maps.wood} />
    </group>)}
    <Block at={[3.25, .1, -4.91]} size={[2.28, .025, .025]} colour={brass} metal />
    {[1.95, 2.8].map((y) => <group key={y}>
      <Block at={[3.25, y, -6.05]} size={[2.25, .055, .36]} colour={walnut} map={maps.wood} />
      {[2.35, 4.15].map((x) => <Block key={x} at={[x, y - .12, -6.12]} size={[.035, .2, .15]} colour={brass} metal />)}
      {[2.45, 2.7, 2.95, 3.2].map((x) => <mesh key={x} position={[x, y + .105, -6.05]} castShadow><cylinderGeometry args={[.065, .052, .15, 12]} /><meshStandardMaterial color="#e5dbc5" roughness={.35} /></mesh>)}
    </group>)}
    <Block at={[3.4, 1.4, -5.4]} size={[.9, .52, .4]} colour="#8c8d86" metal />
    <Block at={[3.4, 1.49, -5.18]} size={[.75, .13, .04]} colour="#242b29" />
    {[3.1, 3.4, 3.7].map((x) => <Block key={x} at={[x, 1.27, -5.13]} size={[.035, .11, .09]} colour={brass} metal />)}
    {[2.3, 2.55, 2.8].map((x) => <Cup key={x} at={[x, 1.1365, -5.35]} />)}
    <CubeCamera position={[4.56, 2.2, -.9]} frames={1} resolution={lowQuality ? 64 : 128} near={.05} far={600}>{(texture) => <mesh rotation-y={-Math.PI / 2}><planeGeometry args={[1.3, 2.1]} /><meshStandardMaterial color="#b5b6a1" envMap={texture} metalness={1} roughness={.24} /></mesh>}</CubeCamera>
    <group position={[4.56, 2.2, -.9]} rotation-y={-Math.PI / 2}>
      {[-.73, .73].map((x) => <Block key={x} at={[x, 0, .02]} size={[.14, 2.35, .14]} colour={brass} metal />)}
      {[-1.12, 1.12].map((y) => <Block key={y} at={[0, y, .02]} size={[1.6, .14, .14]} colour={brass} metal />)}
      {[-.75, .75].flatMap((x) => [-1.1, 1.1].map((y) => <Ring key={`${x}-${y}`} at={[x, y, .1]} radius={.14} tube={.035} colour={brass} arc={Math.PI * 1.7} />))}
    </group>
    {[-.95, 1.75, 4].map((x) => <group key={x} position={[x, 2.15, -6.05]}>
      <Sconce />
    </group>)}
  </group></CafeResources.Provider>;
});
