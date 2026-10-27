import { Suspense, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { DataTexture, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture, type BufferGeometry, type Group } from 'three';
import { animated, useSpring } from '@react-spring/three';
import type { BoardProps } from './Board';
import { createPieceGeometries } from './piece-geometry';

function Piece({ type, colour, selected, wood, geometry }: { type: PieceSymbol; colour: 'w' | 'b'; selected: boolean; wood: Texture; geometry: BufferGeometry }) {
  const { lift } = useSpring({ lift: selected ? .2 : .02, immediate: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  return <animated.group position-y={lift} rotation-y={(colour === 'w' ? 0 : Math.PI) + (type === 'n' ? .4 : 0)}>
    <mesh geometry={geometry} castShadow receiveShadow dispose={null}>
      <meshPhysicalMaterial map={wood} bumpMap={wood} bumpScale={.003} color={colour === 'w' ? '#dbb780' : '#503327'} roughness={.36} clearcoat={.25} clearcoatRoughness={.38} />
    </mesh>
    {type === 'n' && [-1, 1].map((side) => <mesh key={side} position={[side * .132, .93, -.09]} scale={[.35, 1, 1]}>
      <sphereGeometry args={[.026, 12, 8]} /><meshStandardMaterial color={colour === 'w' ? '#503b26' : '#211711'} roughness={.45} />
    </mesh>)}
  </animated.group>;
}
function Scene({ fen, selected, destinations, lastMove, onSquare }: BoardProps) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const group = useRef<Group>(null);
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
  return <group ref={group}>
    <ambientLight intensity={.45} /><hemisphereLight args={['#fff0d6', '#686b65', 1.3]} />
    <directionalLight position={[-5, 9, 4]} intensity={2.5} castShadow shadow-normalBias={.025} shadow-bias={-.0001} shadow-radius={3} shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
    <mesh position={[0, -.2, 0]} receiveShadow><boxGeometry args={[8.65, .4, 8.65]} /><meshStandardMaterial color="#5b3929" roughness={.4} /></mesh>
    {board.flatMap((row, rank) => row.map((piece, file) => {
      const square = `${'abcdefgh'[file]}${8 - rank}` as Square;
      const colour = selected === square ? '#a6aa63' : lastMove.includes(square) ? ((rank + file) % 2 ? '#939563' : '#d7cb8e') : ((rank + file) % 2 ? '#6c7355' : '#d9c59e');
      return <group key={square} position={[file - 3.5, .02, rank - 3.5]} onClick={(e) => { e.stopPropagation(); if (e.delta < 5) onSquare(square); }}>
        <mesh receiveShadow position={[0, -.02, 0]}><boxGeometry args={[1, .04, 1]} /><meshStandardMaterial map={wood} color={colour} roughness={.5} /></mesh>
        {piece && <Piece geometry={geometries[piece.type]} wood={wood} type={piece.type} colour={piece.color} selected={selected === square} />}
        {destinations.includes(square) && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .035, 0]}><ringGeometry args={[piece ? .36 : .08, piece ? .42 : .14, 32]} /><meshBasicMaterial color="#38412c" transparent opacity={.7} /></mesh>}
      </group>;
    }))}
    <mesh position={[0, -.58, 0]} receiveShadow><cylinderGeometry args={[8, 8, .32, 80]} /><meshStandardMaterial color="#74583f" roughness={.58} /></mesh>
    <mesh position={[0, -.8, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#777462" /></mesh>
    {[-10, 10].flatMap((z) => [-7, 0, 7].map((x) => <group key={`${x}-${z}`} position={[x, 0, z]} rotation={[0, z > 0 ? Math.PI : 0, 0]}>
      <mesh position={[0, 3.6, 0]}><boxGeometry args={[5.5, 9, .5]} /><meshStandardMaterial color="#afa48b" /></mesh>
      <mesh position={[0, 3, .3]}><boxGeometry args={[3.7, 5.7, .2]} /><meshStandardMaterial color="#d6c9aa" /></mesh>
      <mesh position={[0, 6, .3]} rotation={[0, 0, Math.PI]}><torusGeometry args={[2, .2, 12, 48, Math.PI]} /><meshStandardMaterial color="#e3d4b4" /></mesh>
      {[-2, 2].map((side) => <mesh key={side} position={[side, 2.6, .3]}><cylinderGeometry args={[.2, .25, 6, 20]} /><meshStandardMaterial color="#e3d4b4" /></mesh>)}
    </group>))}
    <ContactShadows position={[0, -.39, 0]} opacity={.45} scale={15} blur={2.2} far={4} resolution={256} />
  </group>;
}
export default function Board3D(props: BoardProps & { resetKey: number }) {
  const [lowQuality, setLowQuality] = useState(false);
  return <div className="three-board" aria-hidden="true">
    <Canvas key={`${props.flipped}-${props.resetKey}`} shadows={!lowQuality} dpr={lowQuality ? .75 : [1, 1.5]} camera={{ position: props.flipped ? [0, 9.5, -10] : [0, 9.5, 10], fov: 45 }} onCreated={({ gl }) => { gl.setClearColor('#8b8975'); }}>
      <PerformanceMonitor bounds={() => [30, 45]} onDecline={() => setLowQuality(true)} /><Suspense fallback={null}><Scene {...props} /><OrbitControls makeDefault enablePan={false} minDistance={9} maxDistance={17} minPolarAngle={.32} maxPolarAngle={1.05} minAzimuthAngle={props.flipped ? Math.PI - .65 : -.65} maxAzimuthAngle={props.flipped ? Math.PI + .65 : .65} target={[0, 0, 0]} /></Suspense>
    </Canvas>
  </div>;
}
