import { Suspense, useMemo, useRef, useState, useEffect, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { DataTexture, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture, type BufferGeometry, Vector3, PerspectiveCamera } from 'three';
import { animated, useSpring } from '@react-spring/three';
import type { BoardProps } from './Board';
import { createPieceGeometries } from './piece-geometry';
import { CafeEnvironment } from './CafeEnvironment';
import { TableClock, type TableClockProps } from './TableClock';
import type { CapturedPiece } from './captured-pieces';

type TableProps = { captured: CapturedPiece[]; tableClock: TableClockProps };

function Piece({ type, colour, selected, wood, geometry }: { type: PieceSymbol; colour: 'w' | 'b'; selected: boolean; wood: Texture; geometry: BufferGeometry }) {
  const { lift } = useSpring({ lift: selected ? .2 : .02, immediate: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  return <animated.group position-y={lift} rotation-y={(colour === 'w' ? 0 : Math.PI) + (type === 'n' ? .4 : 0)}>
    <mesh geometry={geometry} castShadow receiveShadow dispose={null}>
      <meshPhysicalMaterial map={wood} bumpMap={wood} bumpScale={.003} color={colour === 'w' ? '#dbb780' : '#634734'} roughness={.36} clearcoat={.25} clearcoatRoughness={.38} />
    </mesh>
    {type === 'n' && [-1, 1].map((side) => <mesh key={side} position={[side * .132, .93, -.09]} scale={[.35, 1, 1]}>
      <sphereGeometry args={[.026, 12, 8]} /><meshStandardMaterial color={colour === 'w' ? '#503b26' : '#211711'} roughness={.45} />
    </mesh>)}
  </animated.group>;
}
function Scene({ fen, selected, destinations, lastMove, onSquare, looking, lowQuality, captured, tableClock }: BoardProps & TableProps & { looking: boolean; lowQuality: boolean }) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const geometries = useMemo(createPieceGeometries, []);
  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);
  const wood = useMemo(() => {
    const data = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const grain = 245 + Math.sin(x * .39 + Math.sin(y * .025) * 4 + Math.sin(y * .007) * 8) * 3 + Math.sin(x * 1.7 + Math.sin(y * .06));
      const i = (y * 256 + x) * 4;
      data[i] = grain; data[i + 1] = grain; data[i + 2] = grain; data[i + 3] = 255;
    }
    const texture = new DataTexture(data, 256, 256, RGBAFormat);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping; texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return <group>
    {/* shortcut: ambient fill approximates indirect light; bake architectural lighting before beta. */}
    <ambientLight intensity={.35} /><hemisphereLight args={['#e3edff', '#796951', 1.5]} />
    <directionalLight position={[-24, 26, -18]} color="#ffe4b9" intensity={1.3} castShadow shadow-normalBias={.025} shadow-bias={-.0001} shadow-radius={3} shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
    <mesh position={[0, -.2, 0]} receiveShadow><boxGeometry args={[8.65, .4, 8.65]} /><meshStandardMaterial color="#5b3929" roughness={.4} /></mesh>
    {board.flatMap((row, rank) => row.map((piece, file) => {
      const square = `${'abcdefgh'[file]}${8 - rank}` as Square;
      const colour = selected === square ? '#a6aa63' : lastMove.includes(square) ? ((rank + file) % 2 ? '#939563' : '#d7cb8e') : ((rank + file) % 2 ? '#6c7355' : '#d9c59e');
      return <group key={square} position={[file - 3.5, .02, rank - 3.5]} onClick={(e) => { e.stopPropagation(); if (!looking && e.delta < 5) onSquare(square); }}>
        <mesh receiveShadow position={[0, -.02, 0]}><boxGeometry args={[1, .04, 1]} /><meshStandardMaterial map={wood} color={colour} roughness={.5} /></mesh>
        {piece && <Piece geometry={geometries[piece.type]} wood={wood} type={piece.type} colour={piece.color} selected={selected === square} />}
        {destinations.includes(square) && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .035, 0]}><ringGeometry args={[piece ? .36 : .08, piece ? .42 : .14, 32]} /><meshBasicMaterial color="#38412c" transparent opacity={.7} /></mesh>}
      </group>;
    }))}
    <TableClock {...tableClock} />
    {(['b', 'w'] as const).flatMap((colour) => captured.filter((piece) => piece.colour === colour).map((piece, i) => {
      const side = colour === 'b' ? -1 : 1;
      return <group key={`${colour}-${i}`} name={`captured-${colour}-${piece.type}`} onClick={(event) => event.stopPropagation()} position={[side * (5.2 + i % 2 * .85), -.42, -side * (3.1 - Math.floor(i / 2) * .85)]}>
        <Piece geometry={geometries[piece.type]} wood={wood} type={piece.type} colour={colour} selected={false} />
      </group>;
    }))}
    <CafeEnvironment lowQuality={lowQuality} />
    <ContactShadows position={[0, -.399, 0]} opacity={.45} scale={[23, 18]} blur={2.2} far={4} resolution={256} />
  </group>;
}
function Camera({ flipped, looking, resetKey }: { flipped: boolean; looking: boolean; resetKey: number }) {
  const { camera, size } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const motion = useRef<{ position: Vector3; target: Vector3; elapsed: number; finish: () => void } | null>(null);
  const initial = useRef(true);
  const previousSize = useRef(size);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !(camera instanceof PerspectiveCamera) || !size.width || !size.height) return;
    const resized = previousSize.current.width !== size.width || previousSize.current.height !== size.height;
    previousSize.current = size;
    const side = flipped ? -1 : 1;
    camera.fov = looking ? 86 : 36; camera.updateProjectionMatrix();
    // Fit a 13-unit envelope, including the clock and captured pieces, on either viewport axis.
    const distance = 6.5 / Math.tan(Math.PI / 10) / Math.min(1, size.width / size.height) + 3;
    const position = looking ? new Vector3(0, 8.6, side * 22) : new Vector3(0, Math.sin(.77) * distance, side * Math.cos(.77) * distance);
    const target = looking ? new Vector3(flipped ? 10 : 35, 10, side * -52) : new Vector3(0, 0, 0);
    const azimuth = looking ? Math.atan2(position.x - target.x, position.z - target.z) : flipped ? Math.PI : 0;
    const limits = {
      minDistance: looking ? 60 : distance, maxDistance: looking ? 88 : distance + 7,
      minPolarAngle: looking ? 1.48 : .7, maxPolarAngle: looking ? 1.63 : .84,
      minAzimuthAngle: azimuth - (looking ? .3 : .4), maxAzimuthAngle: azimuth + (looking ? .3 : .4),
    };
    const finish = () => {
      camera.position.copy(position); orbit.target.copy(target);
      Object.assign(orbit, limits); orbit.update(); motion.current = null;
    };
    if (initial.current || resized || window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      // Destination constraints would clamp intermediate frames into a jump.
      Object.assign(orbit, { minDistance: 0, maxDistance: Infinity, minPolarAngle: 0, maxPolarAngle: Math.PI, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
      motion.current = { position, target, elapsed: 0, finish };
    }
    initial.current = false;
  }, [camera, size.width, size.height, flipped, looking, resetKey]);
  useFrame((_, delta) => {
    const move = motion.current, orbit = controls.current;
    if (!move || !orbit) return;
    move.elapsed += delta;
    const amount = 1 - Math.exp(-delta * 16);
    camera.position.lerp(move.position, amount); orbit.target.lerp(move.target, amount);
    if (move.elapsed >= .35) move.finish();
    orbit.update();
  }, -2);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={false} enableZoom={!looking} onStart={() => motion.current?.finish()} />;
}
export default function Board3D(props: BoardProps & TableProps & { resetKey: number; looking: boolean }) {
  const [lowQuality, setLowQuality] = useState(false);
  return <div className="three-board" aria-hidden="true" data-view={props.looking ? 'room' : 'board'}>
    <Canvas shadows={!lowQuality} dpr={lowQuality ? .75 : [1, 1.5]} camera={{ position: [0, 16, 17], fov: 36, far: 600 }} onCreated={({ gl }) => { gl.setClearColor('#c5baa2'); }}>
      <PerformanceMonitor bounds={() => [30, 45]} onDecline={() => setLowQuality(true)} />
      <Suspense fallback={null}><Scene {...props} lowQuality={lowQuality} /><Camera flipped={props.flipped} looking={props.looking} resetKey={props.resetKey} /></Suspense>
    </Canvas>
  </div>;
}
