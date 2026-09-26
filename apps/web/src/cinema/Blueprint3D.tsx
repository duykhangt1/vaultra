import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Edges, Grid } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Blueprint volume of a storage unit at true scale next to a 1.7 m person — the one place where 3D
 * genuinely helps: it answers "how big is it really?". The box eases between sizes; the pointer
 * turns the drafting table slightly. Lazy-loaded; callers render a still image when WebGL is not wanted.
 */
function Volume({ dims }: { dims: [number, number, number] }) {
  const box = useRef<THREE.Mesh>(null);
  const table = useRef<THREE.Group>(null);
  const person = useRef<THREE.Group>(null);
  const cur = useRef(new THREE.Vector3(...dims));
  useFrame((state, dt) => {
    const k = 1 - Math.pow(0.002, dt); // frame-rate independent easing
    const [w, d, h] = dims;
    cur.current.lerp(new THREE.Vector3(w, d, h), k);
    const c = cur.current;
    if (box.current) { box.current.scale.set(c.x, c.z, c.y); box.current.position.set(0, c.z / 2, 0); }
    if (person.current) person.current.position.set(c.x / 2 + 0.55, 0, c.y / 2 - 0.2);
    if (table.current) {
      const t = state.clock.elapsedTime;
      table.current.rotation.y = THREE.MathUtils.lerp(table.current.rotation.y, -0.62 + state.pointer.x * 0.35 + Math.sin(t * 0.25) * 0.05, k * 0.5);
      table.current.rotation.x = THREE.MathUtils.lerp(table.current.rotation.x, state.pointer.y * 0.06, k * 0.5);
    }
    const span = Math.max(c.x, c.y, c.z * 0.9) + 1.2;
    state.camera.position.lerp(new THREE.Vector3(span * 1.25, span * 0.95, span * 1.55), k * 0.6);
    state.camera.lookAt(0, c.z * 0.42, 0);
  });
  return (
    <group ref={table}>
      <mesh ref={box}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#c8963e" transparent opacity={0.13} depthWrite={false} />
        <Edges color="#0e1b2c" lineWidth={1.4} threshold={1} />
      </mesh>
      <group ref={person}>
        <mesh position={[0, 0.85, 0]}>
          <capsuleGeometry args={[0.2, 1.3, 6, 14]} />
          <meshBasicMaterial color="#5b6b7d" transparent opacity={0.35} />
          <Edges color="#46546a" lineWidth={1} threshold={20} />
        </mesh>
      </group>
      <Grid position={[0, 0.001, 0]} args={[30, 30]} cellSize={0.5} cellThickness={0.6} cellColor="#b9c2cd" sectionSize={1} sectionThickness={1} sectionColor="#8794a4" fadeDistance={22} fadeStrength={1.6} infiniteGrid />
    </group>
  );
}
