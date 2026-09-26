import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Float } from '@react-three/drei';
import { useRef } from 'react';
import type { Group } from 'three';

function Boxes() {
  const g = useRef<Group>(null);
  useFrame((s) => { if (g.current) g.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.25) * 0.5 - 0.5; });
  const cells: [number, number, string][] = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) cells.push([x, y, (x * 3 + y) % 5 === 0 ? '#c8963e' : (x + y) % 2 ? '#2a4260' : '#1b3049']);
  return (
    <group ref={g} position={[-1.5, -1.1, 0]}>
      {cells.map(([x, y, c], i) => (
        <Float key={i} speed={1.2} floatIntensity={0.15} rotationIntensity={0}>
          <RoundedBox args={[0.92, 0.92, 1.4]} radius={0.06} position={[x, y, 0]}>
            <meshStandardMaterial color={c} metalness={0.35} roughness={0.5} />
          </RoundedBox>
        </Float>
      ))}
    </group>
  );
}
