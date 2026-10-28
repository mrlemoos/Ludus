import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Color } from 'chess.js';

export type TableClockProps = { times: Record<Color, string>; active: Color | null };
function Display({ times, active, reversed }: TableClockProps & { reversed: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    const c = texture.image.getContext('2d')!;
    c.fillStyle = '#bac4a2'; c.fillRect(0, 0, 768, 192);
    const colours: Color[] = reversed ? ['b', 'w'] : ['w', 'b'];
    colours.forEach((colour, i) => {
      const x = i * 384;
      c.fillStyle = '#29392c'; c.font = 'bold 100px monospace'; c.textAlign = 'center';
      c.fillText(times[colour], x + 192, 151);
      c.fillStyle = colour === 'w' ? '#f4efdc' : '#293027';
      c.beginPath(); c.arc(x + 192, 35, 15, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#29392c'; c.lineWidth = 2; c.stroke();
      if (active === colour) { c.lineWidth = 6; c.strokeRect(x + 8, 8, 368, 176); }
    });
    c.fillStyle = '#667354'; c.fillRect(382, 12, 4, 168);
    texture.needsUpdate = true;
  }, [texture, times.w, times.b, active, reversed]);
  return <mesh position={[0, .08, reversed ? -.671 : .671]} rotation-y={reversed ? Math.PI : 0}>
    <planeGeometry args={[3.45, .86]} /><meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>;
}
export function TableClock({ times, active }: TableClockProps) {
  return <group position={[0, .4, -6.2]} name="table-clock" onClick={(event) => event.stopPropagation()}>
    <RoundedBox args={[3.9, 1.6, 1.34]} radius={.12} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#493024" roughness={.42} /></RoundedBox>
    <Display times={times} active={active} reversed={false} /><Display times={times} active={active} reversed />
    {([-1, 1] as const).map((side) => <mesh key={side} position={[side, active === (side === -1 ? 'w' : 'b') ? .84 : .92, 0]} castShadow>
      <cylinderGeometry args={[.32, .35, .16, 24]} /><meshStandardMaterial color="#987447" metalness={.65} roughness={.38} />
    </mesh>)}
  </group>;
}
