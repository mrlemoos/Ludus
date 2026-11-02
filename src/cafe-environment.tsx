import { createCafeModels } from './cafe-models';
import type { CafeMaterial } from './cafe-models';
import { ContactShadows, CubeCamera, RoundedBox } from '@react-three/drei';
import { createContext, memo, useContext, useEffect, useMemo } from 'react';
import { BoxGeometry, CanvasTexture, CubicBezierCurve3, DoubleSide, ExtrudeGeometry, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Shape, Vector2, Vector3 } from 'three';
import type { Texture } from 'three';

type Point = [number, number, number];
const CafeResources = createContext<{
  box: BoxGeometry;
  materials: Map<string, MeshStandardMaterial>;
  models: ReturnType<typeof createCafeModels>;
  finishes: Record<CafeMaterial, MeshStandardMaterial>;
} | null>(null);

interface ModelProps {
  name: keyof ReturnType<typeof createCafeModels>;
}

function Model({ name }: ModelProps) {
  const resources = useContext(CafeResources)!;
  return (
    <group>
      {resources.models[name].map(({ material, geometry }) => (
        <mesh
          key={material}
          geometry={geometry}
          material={resources.finishes[material]}
          castShadow
          receiveShadow
          dispose={null}
        />
      ))}
    </group>
  );
}
interface BlockProps {
  at: Point;
  size: Point;
  colour: string;
  map?: Texture;
  metal?: boolean;
}

function Block({ at, size, colour, map, metal = false }: BlockProps) {
  const resources = useContext(CafeResources)!;
  const key = `${colour}-${map?.uuid ?? ''}-${metal}`;
  let material = resources.materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color: colour,
      map,
      bumpMap: map,
      bumpScale: map ? 0.004 : 0,
      roughness: metal ? 0.35 : 0.78,
      metalness: metal ? 0.65 : 0,
    });
    resources.materials.set(key, material);
  }
  return (
    <mesh
      position={at}
      scale={size}
      geometry={resources.box}
      material={material}
      receiveShadow
      castShadow
      dispose={null}
    />
  );
}
interface RingProps {
  at: Point;
  radius: number;
  tube: number;
  colour: string;
  curve?: { arc?: number; rotation?: Point };
}

function Ring({ at, radius, tube, colour, curve }: RingProps) {
  const arc = curve?.arc ?? Math.PI * 2;
  const rotation = curve?.rotation ?? ([0, 0, 0] as Point);
  return (
    <mesh position={at} rotation={rotation} castShadow>
      <torusGeometry args={[radius, tube, 6, 32, arc]} />
      <meshStandardMaterial color={colour} roughness={0.65} />
    </mesh>
  );
}
const brass = '#987447',
  carving = '#e5d8bd',
  plaster = '#d8c9ad',
  walnut = '#493024';

function surface(
  kind: 'wood' | 'stone' | 'plaster' | 'floor' | 'ceiling' | 'paper' | 'leather' | 'newsprint',
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!;
  let seed = 17;
  function random() {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  }
  c.fillStyle = kind === 'floor' ? '#b9ad95' : (kind === 'ceiling' ? '#b8a17b' : '#eee8dc');
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = random() * 256;
      const y = random() * 256;
    c.strokeStyle = `rgba(70,48,30,${random() * (kind === 'wood' ? 0.13 : 0.035)})`;
    if (kind === 'wood') {
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x + 3, y + 12, x - 5, y + 28, x + random() * 6, y + 100);
      c.stroke();
    } else {
      c.fillStyle = `rgba(70,48,30,${random() * 0.05})`;
      c.fillRect(x, y, 1, 1);
    }
  }
  if (kind === 'paper') {
    c.fillStyle = '#f4efe4';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++) {
      c.strokeStyle = `rgba(125,112,91,${0.025 + random() * 0.06})`;
      const x = random() * 256;
        const y = random() * 256;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + random() * 5, y + random() * 2);
      c.stroke();
    }
    c.strokeStyle = '#b9ab9120';
    for (let y = 8; y < 256; y += 16)
      {for (let x = 8; x < 256; x += 16) {
        c.beginPath();
        c.arc(x, y, 2, 0, Math.PI * 2);
        c.stroke();
      }}
  }
  if (kind === 'stone')
    {for (let i = 0; i < 14; i++) {
      const x = random() * 256,
        drift = random() * 60 - 30;
      c.strokeStyle = '#887c6a18';
      c.lineWidth = 0.4 + random() * 1.2;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + drift, 80, x - drift, 175, x, 256);
      c.stroke();
    }}
  c.lineWidth = 1;
  if (kind === 'wood') {
    for (let x = 0; x < 256; x++) {
      const tone = Math.sin(x * 0.16 + Math.sin(x * 0.043) * 3);
      c.strokeStyle = `rgba(65,38,19,${0.035 + (tone + 1) * 0.045})`;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 5, 80, x - 5, 170, x, 256);
      c.stroke();
    }
  }
  if (kind === 'floor') {
    for (let y = 0; y < 2; y++)
      {for (let x = 0; x < 2; x++) {
        c.fillStyle = ['#bdb29c', '#c9bda7', '#c5baa3', '#b9af99'][y * 2 + x];
        c.fillRect(x * 128, y * 128, 128, 128);
        const patina = c.createRadialGradient(
          x * 128 + 64,
          y * 128 + 64,
          18,
          x * 128 + 64,
          y * 128 + 64,
          90,
        );
        patina.addColorStop(0, '#ffffff0c');
        patina.addColorStop(1, '#57473322');
        c.fillStyle = patina;
        c.fillRect(x * 128, y * 128, 128, 128);
        c.strokeStyle = '#807764';
        c.strokeRect(x * 128 + 0.5, y * 128 + 0.5, 127, 127);
        c.strokeStyle = '#e5d9bf';
        c.strokeRect(x * 128 + 1.5, y * 128 + 1.5, 125, 125);
      }}
    for (let y = 0; y <= 256; y += 128)
      {for (let x = 0; x <= 256; x += 128) {
        c.fillStyle = '#55594c';
        c.beginPath();
        c.moveTo(x, y - 12);
        c.lineTo(x + 12, y);
        c.lineTo(x, y + 12);
        c.lineTo(x - 12, y);
        c.closePath();
        c.fill();
      }}
  }
  if (kind === 'leather') {
    for (let i = 0; i < 5000; i++) {
      c.fillStyle = `rgba(42,25,20,${random() * 0.16})`;
      c.fillRect(random() * 256, random() * 256, 1, 1);
    }
    c.strokeStyle = '#442a2430';
    for (let x = -256; x <= 512; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 256, 256);
      c.moveTo(x, 0);
      c.lineTo(x - 256, 256);
      c.stroke();
    }
  }
  if (kind === 'newsprint') {
    c.fillStyle = '#ddd3b9';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#534c3b';
    c.font = 'bold 29px Georgia';
    c.textAlign = 'center';
    c.fillText('MADRID', 128, 37);
    c.fillRect(14, 46, 228, 2);
    c.fillRect(14, 52, 228, 1);
    for (let column = 0; column < 3; column++)
      {for (let line = 0; line < 36; line++) {
        c.fillStyle = line < 3 ? '#675e49' : '#8a806a';
        c.fillRect(14 + column * 79, 64 + line * 5, 48 + random() * 22, line < 3 ? 2 : 1);
      }}
    c.fillStyle = '#8c7e65';
    c.fillRect(94, 85, 69, 54);
    c.fillStyle = '#b8aa8c';
    c.fillRect(102, 105, 11, 34);
    c.fillRect(119, 95, 17, 44);
    c.fillRect(142, 109, 13, 30);
  }
  if (kind === 'ceiling') {
    c.strokeStyle = '#6f774d80';
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.ellipse(i * 36, 128, 26, 68, -0.5, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (kind === 'plaster') {
    // Keep wall texture subtle beside carved plaster.
    for (let i = 0; i < 60; i++) {
      const x = random() * 256;
        const y = random() * 256;
      const wash = c.createRadialGradient(x, y, 0, x, y, 40);
      wash.addColorStop(0, '#806c4c08');
      wash.addColorStop(1, '#806c4c00');
      c.fillStyle = wash;
      c.fillRect(0, 0, 256, 256);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  if (kind === 'floor') {texture.repeat.set(7, 10.3 / 0.9);}
  return texture;
}
function Sconce() {
  return (
    <group>
      <mesh position={[0, 0, -0.06]} scale={[0.11, 0.21, 0.035]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial color={brass} metalness={0.65} roughness={0.35} />
      </mesh>
      <Ring
        at={[0, -0.04, 0.08]}
        radius={0.13}
        tube={0.018}
        colour={brass}
        curve={{ arc: Math.PI, rotation: [0, Math.PI / 2, Math.PI] }}
      />
      <mesh position={[0, 0.19, 0.2]}>
        <cylinderGeometry args={[0.1, 0.19, 0.23, 24, 1, true]} />
        <meshStandardMaterial
          color="#ead7ae"
          side={DoubleSide}
          emissive="#f3bb70"
          emissiveIntensity={0.25}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 0.1, 0.2]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color="#ffe8bd" emissive="#ffc478" emissiveIntensity={2} />
      </mesh>
      {[0.075, 0.305].map((y, i) => (
        <Ring
          key={y}
          at={[0, y, 0.2]}
          radius={i ? 0.1 : 0.19}
          tube={0.009}
          colour={brass}
          curve={{ rotation: [Math.PI / 2, 0, 0] }}
        />
      ))}
      <pointLight
        position={[0, 0.12, 0.23]}
        color="#ffd09a"
        intensity={140}
        distance={45}
        decay={2}
      />
    </group>
  );
}
interface ChairProps {
  at: Point;
  angle?: number;
}

function Chair({ at, angle = 0 }: ChairProps) {
  return (
    <group position={at} rotation-y={angle}>
      <Model name="chair" />
    </group>
  );
}
interface CupProps {
  at: Point;
}

function Cup({ at }: CupProps) {
  const profile = useMemo(
    () =>
      [
        [0, 0.009],
        [0.037, 0.009],
        [0.046, 0.015],
        [0.052, 0.035],
        [0.061, 0.077],
        [0.065, 0.103],
        [0.064, 0.108],
        [0.06, 0.11],
        [0.056, 0.107],
        [0.055, 0.101],
        [0.051, 0.078],
        [0.043, 0.035],
        [0.035, 0.023],
        [0, 0.023],
      ].map(([radius, height]) => new Vector2(radius, height)),
    [],
  );
  const handle = useMemo(
    () =>
      new CubicBezierCurve3(
        new Vector3(0.059, 0.091, 0),
        new Vector3(0.123, 0.112, 0),
        new Vector3(0.123, 0.026, 0),
        new Vector3(0.047, 0.036, 0),
      ),
    [],
  );
  return (
    <group position={at}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.105, 0.09, 0.013, 48]} />
        <meshPhysicalMaterial color="#e8dfca" roughness={0.24} clearcoat={0.6} />
      </mesh>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 64]} />
        <meshPhysicalMaterial
          color="#eee5d3"
          roughness={0.2}
          clearcoat={0.8}
          clearcoatRoughness={0.16}
        />
      </mesh>
      <CubeCamera position={[0, 0.094, 0]} frames={1} resolution={64} near={0.02} far={600}>
        {(texture) => (
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.0535, 64]} />
            <meshPhysicalMaterial
              color="#29130a"
              roughness={0.075}
              metalness={0}
              ior={1.333}
              envMap={texture}
              envMapIntensity={1.4}
              clearcoat={1}
              clearcoatRoughness={0.04}
            />
          </mesh>
        )}
      </CubeCamera>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[handle, 48, 0.009, 12, false]} />
        <meshPhysicalMaterial color="#eee5d3" roughness={0.2} clearcoat={0.8} />
      </mesh>
      <Block at={[0.065, 0.0105, 0.04]} size={[0.013, 0.008, 0.15]} colour={brass} metal />
    </group>
  );
}
interface DoorwayProps {
  front?: boolean;
}

function Doorway({ front = false }: DoorwayProps) {
  const spandrel = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.75, 2.05);
    shape.absarc(0, 2.05, 0.75, Math.PI, 0, true);
    shape.lineTo(0.75, 3.1);
    shape.lineTo(-0.75, 3.1);
    shape.closePath();
    return new ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 20 });
  }, []);
  useEffect(() => () =>{  spandrel.dispose(); }, [spandrel]);
  return (
    <group position={[0.4, 0, front ? 3.5 : -6.5]} scale-z={front ? -1 : 1}>
      <Block at={[-1.325, 2.1, 0]} size={[1.15, 4.2, 0.3]} colour={plaster} />
      <Block at={[2.575, 2.1, 0]} size={[3.65, 4.2, 0.3]} colour={plaster} />
      <mesh geometry={spandrel} position-z={-0.15} receiveShadow>
        <meshStandardMaterial color={plaster} />
      </mesh>
      <Block at={[0, 3.65, 0]} size={[1.5, 1.1, 0.3]} colour={plaster} />
      {[-0.84, 0.84].map((x) => (
        <group key={x}>
          <Block at={[x, 1.2, 0.12]} size={[0.22, 2.4, 0.3]} colour={carving} />
          <Block at={[x, 0.14, 0.2]} size={[0.34, 0.28, 0.4]} colour={carving} />
          <Block at={[x, 2.35, 0.23]} size={[0.36, 0.18, 0.44]} colour={carving} />
          <Block at={[x, 1.3, 0.3]} size={[0.09, 1.85, 0.08]} colour={plaster} />
          <Ring
            at={[x, 2.56, 0.25]}
            radius={0.15}
            tube={0.055}
            colour={carving}
            curve={{ arc: Math.PI * 1.7 }}
          />
        </group>
      ))}
      {[0.76, 0.85, 0.95].map((r) => (
        <Ring key={r} at={[0, 2.05, 0.16]} radius={r} tube={0.055} colour={carving} curve={{ arc: Math.PI }} />
      ))}
      <Block at={[0, 3.02, 0.15]} size={[2.25, 0.12, 0.48]} colour={carving} />
      <Model name="portal" />
      {front && (
        <>
          <Block at={[0, 1.55, -0.12]} size={[1.5, 3.1, 0.08]} colour={walnut} />
          <Model name="entranceDoor" />
        </>
      )}
    </group>
  );
}

interface CafeSceneProps {
  lowQuality: boolean;
}

function CafeScene({
  lowQuality,
}: CafeSceneProps) {
  const maps = useMemo(
    () => ({
      wood: surface('wood'),
      stone: surface('stone'),
      plaster: surface('plaster'),
      floor: surface('floor'),
      ceiling: surface('ceiling'),
      paper: surface('paper'),
      leather: surface('leather'),
      newsprint: surface('newsprint'),
    }),
    [],
  );
  const resources = useMemo(
    () => ({
      box: new BoxGeometry(1, 1, 1),
      materials: new Map<string, MeshStandardMaterial>(),
      models: createCafeModels(),
      finishes: {
        wood: new MeshStandardMaterial({
          color: walnut,
          map: maps.wood,
          bumpMap: maps.wood,
          bumpScale: 0.0015,
          roughness: 0.43,
        }),
        leather: new MeshStandardMaterial({
          color: '#592d30',
          map: maps.leather,
          bumpMap: maps.leather,
          bumpScale: 0.0015,
          roughness: 0.52,
        }),
        brass: new MeshStandardMaterial({ color: brass, roughness: 0.36, metalness: 0.65 }),
        plaster: new MeshStandardMaterial({ color: carving, map: maps.plaster, roughness: 0.82 }),
        steel: new MeshStandardMaterial({ color: '#b1b6b2', roughness: 0.28, metalness: 0.8 }),
        black: new MeshStandardMaterial({ color: '#252b28', roughness: 0.48 }),
      },
    }),
    [maps],
  );
  useEffect(
    () => () => {
      resources.box.dispose();
      resources.materials.forEach((material) =>{  material.dispose(); });
      Object.values(resources.finishes).forEach((material) =>{  material.dispose(); });
      Object.values(resources.models)
        .flat()
        .forEach(({ geometry }) =>{  geometry.dispose(); });
    },
    [resources],
  );
  useEffect(() => () =>{  Object.values(maps).forEach((map) => map.dispose()); }, [maps]);
  return (
    <CafeResources.Provider value={resources}>
      <group position={[0, -15.4, 0]} scale={20}>
        <mesh position={[1.65, -0.04, -1.5]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[6.3, 10.3]} />
          <meshStandardMaterial map={maps.floor} roughness={0.85} />
        </mesh>
        <Block
          at={[1.65, 4.27, -1.5]}
          size={[6.3, 0.14, 10.3]}
          colour="#ddd1b6"
          map={maps.plaster}
        />
        <Block at={[4.8, 2.1, -1.5]} size={[0.3, 4.2, 10.3]} colour={plaster} map={maps.plaster} />
        <Block at={[-1.5, 0.5, -1.5]} size={[0.3, 1, 10.3]} colour={plaster} />
        <Block at={[-1.5, 4.02, -1.5]} size={[0.3, 0.36, 10.3]} colour={plaster} />
        {[
          [-5.55, 1.9],
          [-1.8, 1.6],
          [2.25, 2.5],
        ].map(([z, depth]) => (
          <Block
            key={z}
            at={[-1.5, 2.4, z]}
            size={[0.3, 2.8, depth]}
            colour={plaster}
            map={maps.plaster}
          />
        ))}
        {[-3.6, 0].map((z) => (
          <group key={z} position={[-1.35, 0, z]} rotation-y={Math.PI / 2}>
            {[-1.04, 1.04].map((x) => (
              <Block key={x} at={[x, 2.4, -0.075]} size={[0.13, 2.95, 0.45]} colour={carving} />
            ))}
            {[-1.15, 1.15].map((x) => (
              <Block key={x} at={[x, 2.4, 0.08]} size={[0.075, 3.05, 0.08]} colour={carving} />
            ))}
            <Block
              at={[0, 0.99, -0.075]}
              size={[2.25, 0.12, 0.55]}
              colour="#c8bba3"
              map={maps.stone}
            />
            <Block at={[0, 3.85, -0.075]} size={[2.25, 0.14, 0.45]} colour={carving} />
            <Block at={[0, 3.96, 0.025]} size={[2.5, 0.08, 0.2]} colour={carving} />
            {[-0.51, 0.51].map((x) => (
              <Block
                key={x}
                at={[x, 3.1, -0.2]}
                size={[0.025, 1.35, 0.045]}
                colour={walnut}
                map={maps.wood}
              />
            ))}
            {[-0.95, 0, 0.95].map((x) => (
              <Block key={x} at={[x, 2.4, -0.23]} size={[0.045, 2.8, 0.06]} colour={walnut} />
            ))}
            {[1.05, 2.4, 3.8].map((y) => (
              <Block key={y} at={[0, y, -0.23]} size={[1.95, 0.055, 0.06]} colour={walnut} />
            ))}
            {[-0.85, -0.55, -0.25, 0.05, 0.35, 0.65, 0.9].map((x) => (
              <Block
                key={x}
                at={[x, 1.35, -0.55]}
                size={[0.016, 0.65, 0.02]}
                colour="#393a35"
                metal
              />
            ))}
            <Block at={[0, 1.68, -0.55]} size={[2, 0.025, 0.035]} colour="#393a35" metal />
          </group>
        ))}
        <Doorway />
        <Doorway front />
        {/* Second room closes the doorway sightline, including oblique views. */}
        <Block at={[1.65, 2.1, -9]} size={[6.3, 4.2, 0.2]} colour="#ad9679" />
        {[-1.5, 4.8].map((x) => (
          <Block key={x} at={[x, 2.1, -7.8]} size={[0.3, 4.2, 2.6]} colour={plaster} />
        ))}
        <Block at={[1.65, -0.04, -7.8]} size={[6.3, 0.08, 2.6]} colour="#a99d85" />
        <Block at={[1.65, 4.25, -7.8]} size={[6.3, 0.1, 2.6]} colour={plaster} />
        <group position={[0.4, 0, -8.85]}>
          <Block at={[0, 0.52, 0]} size={[2.5, 1.04, 0.08]} colour={walnut} map={maps.wood} />
          <Block at={[0, 1.06, 0.04]} size={[2.6, 0.06, 0.15]} colour={walnut} />
          <Block at={[0, 0.73, 0.65]} size={[0.85, 0.06, 0.65]} colour="#c8bba3" map={maps.stone} />
          <Block at={[0, 0.36, 0.65]} size={[0.09, 0.72, 0.09]} colour={walnut} />
          <group position={[0, 2.1, 0.12]}>
            <Sconce />
          </group>
        </group>
        {/* Continuous rails and cornices turn all four corners. */}
        {[-1.33, 4.63].map((x) => (
          <group key={x}>
            <Block at={[x, 0.5, -1.5]} size={[0.08, 1, 10]} colour={walnut} map={maps.wood} />
            {[0.1, 0.96, 1.05, 3.85, 3.99, 4.12].map((y, i) => (
              <Block
                key={y}
                at={[x, y, -1.5]}
                size={[i > 2 ? 0.15 + (i - 3) * 0.09 : 0.12, i > 2 ? 0.12 : 0.045, 10]}
                colour={i > 2 ? carving : walnut}
              />
            ))}
            <mesh position={[x, 3.94, -1.5]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.14, 0.14, 10, 8]} />
              <meshStandardMaterial color={carving} />
            </mesh>
            {Array.from({ length: 12 }, (_, i) => (
              <Block
                key={i}
                at={[x === -1.33 ? x + 0.06 : x - 0.06, 0.5, -6.05 + i * 0.83]}
                size={[0.035, 0.72, 0.65]}
                colour="#60412e"
                map={maps.wood}
              />
            ))}
            <Block
              at={[x === -1.33 ? x + 0.22 : x - 0.22, 4.18, -1.5]}
              size={[0.3, 0.02, 9.6]}
              colour="#c8b089"
              map={maps.ceiling}
            />
          </group>
        ))}
        {[-6.32, 3.32].map((z) => (
          <group key={z}>
            {[3.85, 3.99, 4.12].map((y, i) => (
              <Block key={y} at={[1.65, y, z]} size={[6, 0.12, 0.15 + i * 0.09]} colour={carving} />
            ))}
            <Block
              at={[1.65, 4.18, z]}
              size={[5.6, 0.02, 0.3]}
              colour="#c8b089"
              map={maps.ceiling}
            />
            {[-0.9, 2.8].map((x) => (
              <group key={x}>
                <Block
                  at={[x, 0.5, z]}
                  size={[x < 0 ? 0.8 : 3.6, 1, 0.08]}
                  colour={walnut}
                  map={maps.wood}
                />
                <Block at={[x, 1.05, z]} size={[x < 0 ? 0.8 : 3.6, 0.06, 0.13]} colour={walnut} />
              </group>
            ))}
          </group>
        ))}
        <Ring
          at={[1.65, 4.17, -1.5]}
          radius={0.6}
          tube={0.04}
          colour={carving}
          curve={{ rotation: [Math.PI / 2, 0, 0] }}
        />
        {[0.42, 0.5, 0.68].map((radius) => (
          <Ring
            key={radius}
            at={[1.65, 4.17, -1.5]}
            radius={radius}
            tube={0.018}
            colour={carving}
            curve={{ rotation: [Math.PI / 2, 0, 0] }}
          />
        ))}
        {[-4.4, 1.85].map((z) => (
          <group key={z} position={[4.59, 2.35, z]} rotation-y={-Math.PI / 2}>
            {[-0.69, 0.69].map((x) => (
              <Block key={x} at={[x, 0, 0]} size={[0.035, 1.9, 0.035]} colour={carving} />
            ))}
            {[-0.95, 0.95].map((y) => (
              <Block key={y} at={[0, y, 0]} size={[1.4, 0.035, 0.035]} colour={carving} />
            ))}
            <Sconce />
          </group>
        ))}
        {/* Facing street, pavement and balconies beyond the actual window openings. */}
        <Block at={[-3.5, -0.08, -1.5]} size={[4, 0.12, 60]} colour="#8f8a7e" />
        <Block at={[-6, 3.5, -1.5]} size={[0.4, 9, 60]} colour="#b08257" map={maps.plaster} />
        {Array.from({ length: 19 }, (_, i) => -27 + i * 3).flatMap((z) =>
          [1.8, 4.5, 7.2].map((y) => (
            <group key={`${z}-${y}`}>
              <Block at={[-5.76, y, z]} size={[0.08, 1.75, 1.1]} colour="#454e49" />
              <Block at={[-5.7, y - 0.92, z]} size={[0.3, 0.12, 1.35]} colour="#d7b78b" />
              <Block at={[-5.5, y - 0.5, z]} size={[0.025, 0.03, 1.4]} colour="#333732" />
              {[-0.6, -0.3, 0, 0.3, 0.6].map((dz) => (
                <Block
                  key={dz}
                  at={[-5.5, y - 0.7, z + dz]}
                  size={[0.025, 0.45, 0.025]}
                  colour="#333732"
                />
              ))}
            </group>
          )),
        )}
        {/* Playing table, top at 0.75 m, board geometry unchanged above it. */}
        <RoundedBox
          position={[0, 0.724, 0]}
          args={[1.15, 0.052, 0.9]}
          radius={0.018}
          smoothness={2}
          receiveShadow
        >
          <meshStandardMaterial color="#c8bba3" map={maps.stone} roughness={0.65} />
        </RoundedBox>
        <Model name="tableBase" />
        <ContactShadows
          position={[1.65, 0.008, -1.5]}
          frames={1}
          opacity={0.35}
          scale={10}
          blur={2}
          far={1.3}
          resolution={lowQuality ? 128 : 256}
        />
        <Chair at={[0, 0, -0.94]} angle={-0.14} />
        <Chair at={[0, 0, 1]} angle={Math.PI} />
        <Cup at={[0.43, 0.7565, 0.19]} />
        <RoundedBox
          position={[0.43, 0.752, -0.04]}
          args={[0.09, 0.003, 0.17]}
          radius={0.0012}
          smoothness={2}
          receiveShadow
          castShadow
        >
          <meshStandardMaterial
            color="#f4efe4"
            map={maps.paper}
            bumpMap={maps.paper}
            bumpScale={0.0005}
            roughness={1}
          />
        </RoundedBox>
        {[-3.7, 1.65].map((z) => (
          <group key={z} position={[2.8, 0, z]}>
            <Block at={[0, 0.73, 0]} size={[0.85, 0.05, 0.8]} colour="#c8bba3" map={maps.stone} />
            <Model name="cafeTableBase" />
            <Chair at={[-0.7, 0, 0]} angle={-Math.PI / 2} />
            <mesh position={[0, 0.762, 0]} rotation={[-Math.PI / 2, 0, -0.15]} receiveShadow>
              <planeGeometry args={[0.3, 0.4]} />
              <meshStandardMaterial map={maps.newsprint} roughness={1} />
            </mesh>
            <Block at={[0.015, 0.758, -0.005]} size={[0.31, 0.004, 0.4]} colour="#c5baa0" />
          </group>
        ))}
        <Block at={[4.24, 0.27, -1]} size={[0.7, 0.54, 6.8]} colour={walnut} map={maps.wood} />
        <Block at={[4.5, 0.83, -1]} size={[0.25, 0.8, 6.8]} colour={walnut} map={maps.wood} />
        {[-3.8, -2.7, -1.6, -0.5, 0.6, 1.7].map((z) => (
          <group key={z}>
            <RoundedBox
              position={[4.16, 0.56, z]}
              args={[0.65, 0.15, 1.05]}
              radius={0.045}
              smoothness={2}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color="#592d30"
                map={maps.leather}
                bumpMap={maps.leather}
                bumpScale={0.0015}
                roughness={0.52}
              />
            </RoundedBox>
            <RoundedBox
              position={[4.34, 0.96, z]}
              args={[0.13, 0.63, 1.05]}
              radius={0.045}
              smoothness={2}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color="#592d30"
                map={maps.leather}
                bumpMap={maps.leather}
                bumpScale={0.0015}
                roughness={0.52}
              />
            </RoundedBox>
            {[-0.25, 0.25].map((dz) => (
              <mesh key={dz} position={[4.266, 1, z + dz]} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.014, 0.014, 0.01, 8]} />
                <meshStandardMaterial color="#391e20" roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
        <Block at={[3.25, 0.53, -5.35]} size={[2.4, 1.06, 0.72]} colour={walnut} map={maps.wood} />
        <Block
          at={[3.25, 1.09, -5.35]}
          size={[2.5, 0.08, 0.84]}
          colour="#c8bba3"
          map={maps.stone}
        />
        {[2.45, 3.25, 4.05].map((x) => (
          <group key={x}>
            <Block
              at={[x, 0.53, -4.977]}
              size={[0.68, 0.77, 0.035]}
              colour="#76543a"
              map={maps.wood}
            />
            <Block
              at={[x, 0.53, -4.95]}
              size={[0.57, 0.65, 0.025]}
              colour={walnut}
              map={maps.wood}
            />
          </group>
        ))}
        <Block at={[3.25, 0.1, -4.91]} size={[2.28, 0.025, 0.025]} colour={brass} metal />
        {[1.95, 2.8].map((y) => (
          <group key={y}>
            <Block
              at={[3.25, y, -6.05]}
              size={[2.25, 0.055, 0.36]}
              colour={walnut}
              map={maps.wood}
            />
            {[2.35, 4.15].map((x) => (
              <Block
                key={x}
                at={[x, y - 0.12, -6.12]}
                size={[0.035, 0.2, 0.15]}
                colour={brass}
                metal
              />
            ))}
            {[2.45, 2.7, 2.95, 3.2].map((x) => (
              <mesh key={x} position={[x, y + 0.105, -6.05]} castShadow>
                <cylinderGeometry args={[0.065, 0.052, 0.15, 12]} />
                <meshStandardMaterial color="#e5dbc5" roughness={0.35} />
              </mesh>
            ))}
          </group>
        ))}
        <group position={[3.4, 1.13, -5.4]}>
          <Model name="espressoMachine" />
        </group>
        {[2.3, 2.55, 2.8].map((x) => (
          <Cup key={x} at={[x, 1.1365, -5.35]} />
        ))}
        <CubeCamera
          position={[4.56, 2.2, -0.9]}
          frames={1}
          resolution={lowQuality ? 64 : 128}
          near={0.05}
          far={600}
        >
          {(texture) => (
            <mesh rotation-y={-Math.PI / 2}>
              <planeGeometry args={[1.3, 2.1]} />
              <meshStandardMaterial
                color="#b5b6a1"
                envMap={texture}
                metalness={1}
                roughness={0.24}
              />
            </mesh>
          )}
        </CubeCamera>
        <group position={[4.56, 2.2, -0.9]} rotation-y={-Math.PI / 2}>
          <Model name="mirror" />
        </group>
        {[-0.95, 1.75, 4].map((x) => (
          <group key={x} position={[x, 2.15, -6.05]}>
            <Sconce />
          </group>
        ))}
      </group>
    </CafeResources.Provider>
  );
}

export const CafeEnvironment = memo(CafeScene);
