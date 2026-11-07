import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

/**
 * 3D stage for the preloader & route curtain: a thin, soft-touch kraft-paper carton with four subdivided
 * flap meshes hinged on their fold lines. As each flap swings open, its vertices gently arch along the
 * span from hinge to tip so the cardboard reads as supple, lightweight paperboard rather than rigid slabs.
 */

import type { BoxState } from './boxState';

// Geometry (world units). Thin paperboard thickness (T = 0.012) gives crisp, delicate carton edges.
const W = 2; const D = 2; const H = 1.42; const T = 0.012;
const FLAP_SEGS = 16;

function kraftTextures() {
  const size = 512;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c59b68'; g.fillRect(0, 0, size, size);
  // soft warm tonal clouds
  for (let i = 0; i < 42; i++) {
    const x = Math.random() * size; const y = Math.random() * size; const r = 40 + Math.random() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(115,78,40,.035)' : 'rgba(244,218,178,.045)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine, delicate paper fibres
  for (let i = 0; i < 7500; i++) {
    const x = Math.random() * size; const y = Math.random() * size; const l = 2 + Math.random() * 9; const a = Math.random() * Math.PI;
    g.strokeStyle = Math.random() < 0.5 ? `rgba(82,52,22,${0.03 + Math.random() * 0.06})` : `rgba(245,216,172,${0.03 + Math.random() * 0.06})`;
    g.lineWidth = 0.4 + Math.random() * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // subtle micro-fluting
  for (let x = 0; x < size; x += 6) { g.fillStyle = 'rgba(90,58,26,.025)'; g.fillRect(x, 0, 1.5, size); }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(c); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

/** Printed mark on the front wall (transparent canvas -> decal plane). */
function printTexture(kind: 'logo' | 'arrows') {
  const c = document.createElement('canvas'); c.width = 768; c.height = 384;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.fillStyle = 'rgba(58,36,16,.82)';
  if (kind === 'logo') {
    g.font = '800 118px Archivo, "Arial Black", Arial, sans-serif';
    (g as unknown as { letterSpacing: string }).letterSpacing = '14px';
    g.fillText('VAULTRA', 384, 180);
    g.font = '500 34px "JetBrains Mono", monospace'; (g as unknown as { letterSpacing: string }).letterSpacing = '10px';
    g.fillText('KHO TỰ QUẢN', 384, 240);
    g.fillRect(264, 270, 240, 3);
    g.font = '500 26px "JetBrains Mono", monospace'; (g as unknown as { letterSpacing: string }).letterSpacing = '7px';
    g.fillText('NHẬN KHO · NHẬN PIN', 384, 318);
  } else {
    g.font = '700 120px Arial, sans-serif'; g.fillText('↑ ↑', 384, 190);
    g.font = '500 30px "JetBrains Mono", monospace'; (g as unknown as { letterSpacing: string }).letterSpacing = '8px'; g.fillText('ĐỂ THẲNG ĐỨNG', 384, 270);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Thin wall panel. */
function Panel({ size, position, material, castShadow = true }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material; castShadow?: boolean }) {
  return <mesh position={position} castShadow={castShadow} receiveShadow material={material}><boxGeometry args={size} /></mesh>;
}

/**
 * Subdivided thin cardboard flap that gently arches along its span (`axis`: 'x' or 'z')
 * as it swings open, giving the paperboard a soft, supple flex instead of a rigid plank look.
 */
function FlexFlap({
  size,
  position,
  axis,
  dir,
  material,
  angleGetter,
}: {
  size: [number, number, number];
  position: [number, number, number];
  axis: 'x' | 'z';
  dir: 1 | -1;
  material: THREE.Material;
  angleGetter: () => number;
}) {
  const geom = React.useMemo(() => {
    const segsX = axis === 'x' ? FLAP_SEGS : 1;
    const segsZ = axis === 'z' ? FLAP_SEGS : 1;
    const g = new THREE.BoxGeometry(size[0], size[1], size[2], segsX, 1, segsZ);
    g.userData.basePos = (g.attributes.position.array as Float32Array).slice();
    return g;
  }, [size, axis]);

  React.useEffect(() => () => geom.dispose(), [geom]);

  const span = axis === 'x' ? size[0] : size[2];
  const halfSpan = span / 2;
  const lastAngle = React.useRef(-1);

  useFrame(() => {
    const deg = angleGetter();
    if (Math.abs(deg - lastAngle.current) < 0.05) return;
    lastAngle.current = deg;
    const p = THREE.MathUtils.clamp(deg / 128, 0, 1);
    // Soft trailing lag while lifting, settling into a gentle outward paper droop when open
    const bend = -Math.sin(p * Math.PI) * 0.065 + Math.pow(p, 1.35) * 0.145;
    const pos = geom.attributes.position;
    const base = geom.userData.basePos as Float32Array;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const coord = axis === 'x' ? base[i] : base[i + 2];
      // u = 0 at the hinge edge, u = 1 at the free tip edge
      const u = THREE.MathUtils.clamp((coord * dir + halfSpan) / span, 0, 1);
      const curve = Math.pow(u, 1.7) * bend;
      arr[i] = base[i];
      arr[i + 1] = base[i + 1] + curve;
      arr[i + 2] = base[i + 2];
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return <mesh position={position} geometry={geom} material={material} castShadow receiveShadow />;
}

function Carton({ st }: { st: React.MutableRefObject<BoxState> }) {
  const root = React.useRef<THREE.Group>(null);
  const f = React.useRef<THREE.Group>(null); const b = React.useRef<THREE.Group>(null);
  const l = React.useRef<THREE.Group>(null); const r = React.useRef<THREE.Group>(null);
  const { map, bump } = React.useMemo(kraftTextures, []);
  const material = React.useMemo(() => new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.16, color: '#fffaf3', roughness: 0.88, metalness: 0 }), [map, bump]);
  const inner = React.useMemo(() => new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.12, color: '#e6cfa8', roughness: 0.92 }), [map, bump]);
  const logo = React.useMemo(() => printTexture('logo'), []);
  const arrows = React.useMemo(() => printTexture('arrows'), []);
  React.useEffect(() => () => { map.dispose(); bump.dispose(); material.dispose(); inner.dispose(); logo.dispose(); arrows.dispose(); }, [map, bump, material, inner, logo, arrows]);

  const rad = THREE.MathUtils.degToRad;
  useFrame(() => {
    const s = st.current;
    if (root.current) {
      const base = Math.max(s.s, 0.0001);
      const sq = s.squash || 0;
      root.current.scale.set(base * (1 + sq * 0.045), base * (1 - sq * 0.07), base * (1 + sq * 0.045));
      root.current.position.y = s.lift;
    }
    if (f.current) f.current.rotation.x = rad(s.front);
    if (b.current) b.current.rotation.x = rad(-s.back);
    if (l.current) l.current.rotation.z = rad(s.left);
    if (r.current) r.current.rotation.z = rad(-s.right);
  });

  const half = W / 2 - 0.004;
  const fbLen = D / 2 - 0.004;
  return (
    <group ref={root}>
      {/* base + four thin walls */}
      <Panel size={[W, T, D]} position={[0, T / 2, 0]} material={inner} />
      <Panel size={[W, H, T]} position={[0, H / 2, D / 2 - T / 2]} material={material} />
      <Panel size={[W, H, T]} position={[0, H / 2, -D / 2 + T / 2]} material={material} />
      <Panel size={[T, H, D]} position={[-W / 2 + T / 2, H / 2, 0]} material={material} />
      <Panel size={[T, H, D]} position={[W / 2 - T / 2, H / 2, 0]} material={material} />
      {/* printing */}
      <mesh position={[0, H * 0.46, D / 2 + 0.0015]}><planeGeometry args={[1.48, 0.74]} /><meshStandardMaterial map={logo} transparent roughness={1} polygonOffset polygonOffsetFactor={-2} /></mesh>
      <mesh position={[W / 2 + 0.0015, H * 0.46, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.28, 0.64]} /><meshStandardMaterial map={arrows} transparent roughness={1} polygonOffset polygonOffsetFactor={-2} /></mesh>
      {/* flexible paperboard flaps */}
      <group ref={l} position={[-W / 2 + T / 2, H, 0]}>
        <FlexFlap size={[half, T, D - 0.008]} position={[half / 2, T / 2, 0]} axis="x" dir={1} material={material} angleGetter={() => st.current.left} />
      </group>
      <group ref={r} position={[W / 2 - T / 2, H, 0]}>
        <FlexFlap size={[half, T, D - 0.008]} position={[-half / 2, T / 2, 0]} axis="x" dir={-1} material={material} angleGetter={() => st.current.right} />
      </group>
      <group ref={f} position={[0, H + T, D / 2 - T / 2]}>
        <FlexFlap size={[W - 0.008, T, fbLen]} position={[0, T / 2, -fbLen / 2]} axis="z" dir={-1} material={material} angleGetter={() => st.current.front} />
      </group>
      <group ref={b} position={[0, H + T, -D / 2 + T / 2]}>
        <FlexFlap size={[W - 0.008, T, fbLen]} position={[0, T / 2, fbLen / 2]} axis="z" dir={1} material={material} angleGetter={() => st.current.back} />
      </group>
    </group>
  );
}

/** Warm light that blooms inside the carton while the camera dives in, so the inside reads as a glowing room, not a dark hole. */
function InteriorLight({ st }: { st: React.MutableRefObject<BoxState> }) {
  const light = React.useRef<THREE.PointLight>(null);
  useFrame(() => { if (light.current) light.current.intensity = (st.current.glow || 0) * 9; });
  return <pointLight ref={light} position={[0, 0.9, 0]} intensity={0} distance={7} decay={1.6} color="#ffc983" />;
}

/** Camera orbit driven by the shared state; frame-exact and aspect-aware (phones sit further back). */
function Rig({ st }: { st: React.MutableRefObject<BoxState> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const s = st.current; const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const k = aspect < 1 ? Math.max(1, 0.85 / aspect) : 1;
    const r = s.r * (1 + (k - 1) * THREE.MathUtils.clamp((s.r - 0.55) / 10, 0, 1));
    cam.position.set(Math.sin(s.az) * Math.cos(s.el) * r, s.ty + Math.sin(s.el) * r, Math.cos(s.az) * Math.cos(s.el) * r);
    cam.lookAt(0, s.ty, 0);
    if (Math.abs(cam.fov - s.fov) > 0.01) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
  });
  return null;
}

export default function BoxStage({ st, active = true }: { st: React.MutableRefObject<BoxState>; active?: boolean }) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.05, far: 60, position: [0, 4, 9] }}
      onCreated={({ gl }) => { gl.shadowMap.type = THREE.PCFSoftShadowMap; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.06; }}
    >
      <Rig st={st} />
      <ambientLight intensity={0.72} color="#fff4e6" />
      <directionalLight
        position={[4.5, 9, 5.5]} intensity={2.1} color="#fff6eb" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={1} shadow-camera-far={24}
        shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={9}
      />
      <directionalLight position={[-6, 4, -3]} intensity={0.55} color="#e4ecff" />
      <Carton st={st} />
      <InteriorLight st={st} />
      {/* floor: catches the cast shadow only, so the page colour stays uniform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><shadowMaterial opacity={0.18} /></mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.42} scale={9} blur={3.6} far={2.4} resolution={512} color="#2a1c10" frames={Infinity} />
    </Canvas>
  );
}
