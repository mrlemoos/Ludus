import { Suspense, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { Vector2, DataTexture, RepeatWrapping, RGBAFormat, type Texture, type Group } from 'three';
import { animated, useSpring } from '@react-spring/three';
import type { BoardProps } from './Board';

const profiles: Record<PieceSymbol, number[][]> = {
  p: [[0, 0], [.28, 0], [.29, .07], [.23, .12], [.18, .19], [.12, .4], [.18, .46], [.17, .5], [.08, .54], [0, .55]],
  r: [[0, 0], [.31, 0], [.32, .08], [.25, .16], [.2, .24], [.18, .55], [.27, .61], [.28, .72], [0, .72]],
  n: [[0, 0], [.3, 0], [.31, .08], [.25, .16], [.2, .24], [.19, .32], [0, .33]],
  b: [[0, 0], [.3, 0], [.31, .08], [.24, .16], [.17, .28], [.11, .6], [.22, .64], [.2, .7], [0, .72]],
  q: [[0, 0], [.32, 0], [.33, .08], [.25, .18], [.18, .32], [.12, .68], [.25, .74], [.22, .8], [.29, .98], [0, .98]],
  k: [[0, 0], [.34, 0], [.35, .08], [.26, .18], [.18, .35], [.13, .72], [.25, .78], [.23, .87], [.16, .92], [0, .92]],
};
function Piece({ type, colour, selected, wood }: { type: PieceSymbol; colour: 'w' | 'b'; selected: boolean; wood: Texture }) {
  const points = useMemo(() => profiles[type].map(([x, y]) => new Vector2(x, y)), [type]);
  const { lift } = useSpring({ lift: selected ? .2 : .02, immediate: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  const material = <meshStandardMaterial map={wood} color={colour === 'w' ? '#cba36a' : '#493024'} roughness={.32} metalness={.05} />;
  return <animated.group position-y={lift}>
    <mesh castShadow receiveShadow><latheGeometry args={[points, 40]} />{material}</mesh>
    {type === 'p' && <mesh position={[0, .65, 0]} castShadow><sphereGeometry args={[.19, 24, 16]} />{material}</mesh>}
    {type === 'b' && <mesh position={[0, .86, 0]} scale={[.16, .26, .16]} castShadow><sphereGeometry args={[1, 24, 16]} />{material}</mesh>}
    {type === 'q' && <mesh position={[0, 1.07, 0]} castShadow><sphereGeometry args={[.1, 16, 12]} />{material}</mesh>}
    {type === 'k' && <group position={[0, 1.08, 0]}><mesh castShadow><boxGeometry args={[.09, .35, .09]} />{material}</mesh><mesh position={[0, .06, 0]} castShadow><boxGeometry args={[.28, .08, .09]} />{material}</mesh></group>}
    {type === 'r' && Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 3) * .22, .78, Math.sin(i * Math.PI / 3) * .22]} rotation={[0, -i * Math.PI / 3, 0]} castShadow><boxGeometry args={[.13, .15, .13]} />{material}</mesh>)}
    {type === 'n' && <group rotation={[0, colour === 'w' ? 0 : Math.PI, 0]}><mesh position={[0, .58, .03]} rotation={[.25, 0, 0]} castShadow><boxGeometry args={[.25, .56, .3]} />{material}</mesh><mesh position={[0, .87, -.1]} rotation={[-.35, 0, 0]} castShadow><boxGeometry args={[.25, .3, .43]} />{material}</mesh><mesh position={[0, 1.06, .02]} castShadow><coneGeometry args={[.13, .25, 3]} />{material}</mesh></group>}
  </animated.group>;
}
function Scene({ fen, selected, destinations, lastMove, onSquare }: BoardProps) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const group = useRef<Group>(null);
  const wood = useMemo(() => {
    const data = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const grain = 245 + Math.sin(x * 1.6 + Math.sin(y * .06) * 2) * 3 + Math.sin(x * .37) * 3;
      const i = (y * 128 + x) * 4;
      data[i] = grain; data[i + 1] = grain; data[i + 2] = grain; data[i + 3] = 255;
    }
    const texture = new DataTexture(data, 128, 128, RGBAFormat);
    texture.wrapS = texture.wrapT = RepeatWrapping; texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return <group ref={group}>
    <ambientLight intensity={.65} /><hemisphereLight args={['#ffe9be', '#5d5243', 1.4]} />
    <directionalLight position={[-5, 9, 4]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
    <mesh position={[0, -.2, 0]} receiveShadow><boxGeometry args={[8.65, .4, 8.65]} /><meshStandardMaterial color="#5b3929" roughness={.4} /></mesh>
    {board.flatMap((row, rank) => row.map((piece, file) => {
      const square = `${'abcdefgh'[file]}${8 - rank}` as Square;
      const colour = selected === square ? '#a6aa63' : lastMove.includes(square) ? ((rank + file) % 2 ? '#939563' : '#d7cb8e') : ((rank + file) % 2 ? '#6c7355' : '#d9c59e');
      return <group key={square} position={[file - 3.5, .02, rank - 3.5]} onClick={(e) => { e.stopPropagation(); if (e.delta < 5) onSquare(square); }}>
        <mesh receiveShadow position={[0, -.02, 0]}><boxGeometry args={[1, .04, 1]} /><meshStandardMaterial map={wood} color={colour} roughness={.5} /></mesh>
        {piece && <Piece wood={wood} type={piece.type} colour={piece.color} selected={selected === square} />}
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
