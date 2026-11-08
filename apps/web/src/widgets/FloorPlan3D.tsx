import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Compass, Eye, Layers, Navigation, RotateCcw } from 'lucide-react';
import { STATUS } from '@/lib/format';
import { type PlanBounds, type WayfindingResult, type Waypoint2D } from '@/lib/wayfinding';
import { cn } from '@/ui';

/**
 * Interactive 3D Architectural Maquette & Live Wayfinding Stage.
 * Zero external network dependencies: procedural lighting + crisp high-DPI CanvasTextures.
 */

export type CameraPreset = 'overview' | 'entrance' | 'top' | 'route';

export interface FloorPlan3DProps {
  zoneName?: string;
  floorNumber?: number;
  units: any[];
  bb: PlanBounds;
  selectedUnit: any | null;
  onSelectUnit: (u: any, secondClick?: boolean) => void;
  route: WayfindingResult | null;
  filterStatus?: string;
  searchQuery?: string;
  dark?: boolean;
  onPrimaryAction?: (u: any) => void;
  primaryActionLabel?: string;
  className?: string;
}

/** 40 floor-plan pixels = 1.0 architectural world unit. */
const WORLD_SCALE = 0.025;

interface UnitPalette {
  wall: string;
  roof: string;
  door: string;
  edge: string;
  ink: string;
  accent: string;
}

const PALETTE: Record<string, UnitPalette> = {
  AVAILABLE: { wall: '#f8fafc', roof: '#ffffff', door: '#0f2a4a', edge: '#1e3a5f', ink: '#0e1b2c', accent: '#0f2a4a' },
  OCCUPIED: { wall: '#fde68a', roof: '#fef3c7', door: '#b45309', edge: '#92400e', ink: '#451a03', accent: '#d97706' },
  RESERVED: { wall: '#bfdbfe', roof: '#dbeafe', door: '#1d4ed8', edge: '#1e40af', ink: '#172554', accent: '#2563eb' },
  OVERLOCKED: { wall: '#fecaca', roof: '#fee2e2', door: '#dc2626', edge: '#991b1b', ink: '#450a0a', accent: '#dc2626' },
  PENDING_INSPECTION: { wall: '#fbcfe8', roof: '#fce7f3', door: '#be185d', edge: '#9d174d', ink: '#500724', accent: '#db2777' },
  MAINTENANCE: { wall: '#e9d5ff', roof: '#f3e8ff', door: '#7e22ce', edge: '#6b21a8', ink: '#3b0764', accent: '#9333ea' },
  OUT_OF_SERVICE: { wall: '#cbd5e1', roof: '#e2e8f0', door: '#475569', edge: '#334155', ink: '#0f172a', accent: '#475569' },
  RETIRED: { wall: '#cbd5e1', roof: '#e2e8f0', door: '#475569', edge: '#334155', ink: '#0f172a', accent: '#475569' },
};

function createConcreteFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;

  g.fillStyle = '#f3eee4';
  g.fillRect(0, 0, size, size);

  // Subtle warm mineral aggregate clouds
  for (let i = 0; i < 36; i++) {
    const x = ((i * 97) % size);
    const y = ((i * 151) % size);
    const r = 45 + (i % 5) * 20;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, i % 2 === 0 ? 'rgba(180,164,136,0.06)' : 'rgba(255,252,246,0.09)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Crisp architectural tile joints
  g.strokeStyle = 'rgba(14, 27, 44, 0.085)';
  g.lineWidth = 2;
  const step = 128;
  for (let p = 0; p <= size; p += step) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }

  // Secondary subtle sub-grid
  g.strokeStyle = 'rgba(176, 128, 42, 0.055)';
  g.lineWidth = 1;
  for (let p = 64; p < size; p += step) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function createDoorCorrugationTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);

  // Horizontal roll-up steel door slats
  const slatH = 16;
  for (let y = 0; y < h; y += slatH) {
    const grad = g.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.28, '#f1f4f8');
    grad.addColorStop(0.72, '#cdd4de');
    grad.addColorStop(0.9, '#9ba6b5');
    grad.addColorStop(1, '#e6ebf1');
    g.fillStyle = grad;
    g.fillRect(0, y, w, slatH);
  }

  // Subtle vertical guide shadow on left/right edges
  const sideGrad = g.createLinearGradient(0, 0, w, 0);
  sideGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
  sideGrad.addColorStop(0.08, 'rgba(0,0,0,0)');
  sideGrad.addColorStop(0.92, 'rgba(0,0,0,0)');
  sideGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sideGrad;
  g.fillRect(0, 0, w, h);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const bump = new THREE.CanvasTexture(c);
  bump.anisotropy = 4;
  return { map, bump };
}

function createPortalSignTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 220;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = '#091320';
  g.fillRect(0, 0, w, h);

  // Brushed brass double frame
  g.strokeStyle = '#c8963e';
  g.lineWidth = 10;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.strokeStyle = 'rgba(221, 176, 101, 0.4)';
  g.lineWidth = 3;
  g.strokeRect(26, 26, w - 52, h - 52);

  g.textAlign = 'center';
  g.fillStyle = '#ddb065';
  g.font = '700 32px "JetBrains Mono", monospace';
  g.fillText('VAULTRA SELF-STORAGE · CỔNG PIN 24/7', w / 2, 74);

  g.fillStyle = '#f8f5ee';
  g.font = '800 68px "Bricolage Grotesque", "Be Vietnam Pro", Arial, sans-serif';
  g.fillText('LỐI VÀO CHÍNH', w / 2, 152);

  g.fillStyle = '#b9c2cd';
  g.font = '600 24px "Be Vietnam Pro", Arial, sans-serif';
  g.fillText('QUẦY LỄ TÂN  ·  XE ĐẨY HÀNG', w / 2, 190);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createFloorThresholdTexture(zoneLabel: string): THREE.CanvasTexture {
  const w = 768;
  const h = 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = '#0e1b2c';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c8963e';
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);

  g.textAlign = 'center';
  g.fillStyle = '#ddb065';
  g.font = '800 44px "Be Vietnam Pro", Arial, sans-serif';
  g.fillText('▲   LỐI VÀO CHÍNH   ▲', w / 2, 92);

  g.fillStyle = '#dce4ee';
  g.font = '600 26px "JetBrains Mono", monospace';
  g.fillText((zoneLabel || 'KHU LƯU TRỮ').toUpperCase(), w / 2, 146);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createRoofPlateTexture(
  shortCode: string,
  areaLabel: string,
  status: string,
  isSelected: boolean,
  hasFlag: boolean,
): THREE.CanvasTexture {
  const w = 256;
  const h = 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const pal = PALETTE[status] ?? PALETTE.AVAILABLE;

  g.clearRect(0, 0, w, h);

  // Rounded architectural label plaque
  const pad = 12;
  const rw = w - pad * 2;
  const rh = h - pad * 2;
  const r = 20;

  g.beginPath();
  if (typeof g.roundRect === 'function') {
    g.roundRect(pad, pad, rw, rh, r);
  } else {
    g.rect(pad, pad, rw, rh);
  }
  g.fillStyle = isSelected ? '#0e1b2c' : pal.roof;
  g.fill();

  if (!isSelected && (status === 'MAINTENANCE' || status === 'OUT_OF_SERVICE' || status === 'RETIRED')) {
    g.save();
    g.clip();
    g.strokeStyle = status === 'MAINTENANCE' ? 'rgba(126, 34, 206, 0.22)' : 'rgba(71, 85, 105, 0.22)';
    g.lineWidth = 8;
    for (let d = -h; d < w + h; d += 22) {
      g.beginPath();
      g.moveTo(d, 0);
      g.lineTo(d - h, h);
      g.stroke();
    }
    g.restore();
  }

  g.lineWidth = isSelected ? 9 : 6;
  g.strokeStyle = isSelected ? '#f0b952' : pal.accent;
  g.stroke();

  // Top color accent strip
  g.fillStyle = isSelected ? '#ddb065' : pal.accent;
  g.fillRect(pad + 24, pad + 14, rw - 48, 8);

  // Crisp unit short code
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = isSelected ? '#ffffff' : pal.ink;
  const fontSize = shortCode.length > 4 ? 50 : 64;
  g.font = `800 ${fontSize}px "Bricolage Grotesque", "Be Vietnam Pro", Arial, sans-serif`;
  g.fillText(shortCode, w / 2, areaLabel ? h / 2 - 10 : h / 2 + 4);

  if (areaLabel) {
    g.fillStyle = isSelected ? '#ddb065' : pal.ink;
    g.globalAlpha = isSelected ? 1 : 0.78;
    g.font = '700 27px "JetBrains Mono", "Be Vietnam Pro", monospace';
    g.fillText(areaLabel, w / 2, h / 2 + 44);
    g.globalAlpha = 1;
  }

  if (hasFlag) {
    g.beginPath();
    g.arc(w - 38, 38, 20, 0, Math.PI * 2);
    g.fillStyle = '#b3362b';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '800 26px Arial, sans-serif';
    g.fillText('!', w - 38, 40);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Builds a smooth 3D CurvePath with laser-straight corridor runs and quadratic rounded turns. */
function buildFilletedCurve3D(waypoints: Waypoint2D[], cx0: number, cy0: number, yLevel: number): THREE.CurvePath<THREE.Vector3> | null {
  if (waypoints.length < 2) return null;
  const pts = waypoints.map((p) => new THREE.Vector3((p.x - cx0) * WORLD_SCALE, yLevel, (p.y - cy0) * WORLD_SCALE));
  const path = new THREE.CurvePath<THREE.Vector3>();

  if (pts.length === 2) {
    path.add(new THREE.LineCurve3(pts[0], pts[1]));
    return path;
  }

  let cursor = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const vIn = curr.clone().sub(prev);
    const vOut = next.clone().sub(curr);
    const lenIn = vIn.length();
    const lenOut = vOut.length();
    if (lenIn < 0.02 || lenOut < 0.02) continue;

    const radius = Math.min(0.24, lenIn * 0.38, lenOut * 0.38);
    const pEnter = curr.clone().addScaledVector(vIn.normalize(), -radius);
    const pExit = curr.clone().addScaledVector(vOut.normalize(), radius);

    if (cursor.distanceTo(pEnter) > 0.005) {
      path.add(new THREE.LineCurve3(cursor, pEnter));
    }
    path.add(new THREE.QuadraticBezierCurve3(pEnter, curr, pExit));
    cursor = pExit;
  }

  const last = pts[pts.length - 1];
  if (cursor.distanceTo(last) > 0.005) {
    path.add(new THREE.LineCurve3(cursor, last));
  }

  return path.curves.length > 0 ? path : null;
}

/** Miniature 3D architectural storage unit with corrugated steel roll-up door & roof code plate. */
const StorageUnitMesh = React.memo(function StorageUnitMesh({
  u,
  cx0,
  cy0,
  isSelected,
  isDimmed,
  doorTextures,
  getRoofTexture,
  onSelect,
}: {
  u: any;
  cx0: number;
  cy0: number;
  isSelected: boolean;
  isDimmed: boolean;
  doorTextures: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
  getRoofTexture: (key: string, create: () => THREE.CanvasTexture) => THREE.CanvasTexture;
  onSelect: (u: any, secondClick?: boolean) => void;
}) {
  const s = u.shape;
  const groupRef = React.useRef<THREE.Group>(null);
  const [hovered, setHovered] = React.useState(false);

  const w3d = Math.max(0.44, s.w * WORLD_SCALE - 0.035);
  const d3d = Math.max(0.44, s.h * WORLD_SCALE - 0.035);
  const rawHm = Number(u.type?.height_m ?? u.unit_type?.height_m ?? 2.4) || 2.4;
  const h3d = THREE.MathUtils.clamp(rawHm * 0.44, 0.56, 1.56);

  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const posX = (cx - cx0) * WORLD_SCALE;
  const posZ = (cy - cy0) * WORLD_SCALE;

  const deg = ((s.rotation ?? 0) % 360 + 360) % 360;
  // Exact handedness match: +deg clockwise in 2D SVG == -deg around +Y in Three.js
  const rotY = -(deg * Math.PI) / 180;
  const flipRoofText = deg > 95 && deg < 265;

  const pal = PALETTE[u.status] ?? PALETTE.AVAILABLE;
  const shortCode = String(u.code ?? '').split('-').pop() || String(u.code ?? '');
  const area = u.type?.area_m2 ?? u.unit_type?.area_m2;
  const areaLabel = area ? `${Number(area)} m²` : '';
  const hasFlag = Boolean(u.flag && u.flag !== 'NONE');

  const roofTexKey = `${shortCode}|${areaLabel}|${u.status}|${isSelected ? 1 : 0}|${hasFlag ? 1 : 0}`;
  const roofTex = getRoofTexture(roofTexKey, () => createRoofPlateTexture(shortCode, areaLabel, u.status, isSelected, hasFlag));

  const dw = Math.min(w3d * 0.68, 1.08);
  const dh = h3d * 0.8;
  const opacity = isDimmed && !isSelected ? 0.24 : 1;

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const targetY = isSelected ? 0.055 : hovered && !isDimmed ? 0.075 : 0;
    const k = 1 - Math.pow(0.0008, dt);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, k);
  });

  React.useEffect(() => {
    return () => {
      if (hovered) document.body.style.cursor = '';
    };
  }, [hovered]);

  return (
    <group
      ref={groupRef}
      position={[posX, 0, posZ]}
      rotation={[0, rotY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(u, isSelected);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onSelect(u, true);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      {/* Active selection floor halo */}
      {isSelected && (
        <mesh position={[0, 0.012, 0]}>
          <boxGeometry args={[w3d + 0.18, 0.022, d3d + 0.18]} />
          <meshStandardMaterial color="#f0b952" emissive="#c8963e" emissiveIntensity={0.65} roughness={0.3} metalness={0.4} />
        </mesh>
      )}

      {/* Main extruded unit vault */}
      <mesh position={[0, h3d / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w3d, h3d, d3d]} />
        <meshStandardMaterial
          color={hovered && !isSelected ? '#fffdf8' : pal.wall}
          roughness={0.76}
          metalness={0.04}
          transparent={opacity < 1}
          opacity={opacity}
        />
        <Edges
          color={isSelected ? '#ddb065' : hovered ? '#0e1b2c' : pal.edge}
          threshold={15}
        />
      </mesh>

      {/* Architectural stepped roof bevel */}
      <mesh position={[0, h3d + 0.016, 0]} receiveShadow>
        <boxGeometry args={[Math.max(0.2, w3d - 0.06), 0.032, Math.max(0.2, d3d - 0.06)]} />
        <meshStandardMaterial
          color={isSelected ? '#142842' : pal.roof}
          roughness={0.7}
          metalness={0.08}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* Crisp high-DPI roof code plate */}
      <mesh
        position={[0, h3d + 0.035, 0]}
        rotation={[-Math.PI / 2, 0, flipRoofText ? Math.PI : 0]}
      >
        <planeGeometry args={[w3d * 0.88, d3d * 0.82]} />
        <meshBasicMaterial
          map={roofTex}
          transparent
          opacity={opacity}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>

      {/* 3D Corrugated Roll-Up Steel Door Assembly on +Z front face */}
      <group position={[0, 0, d3d / 2]}>
        {/* Dark steel door frame jambs */}
        <mesh position={[0, (dh + 0.05) / 2, 0.006]}>
          <boxGeometry args={[dw + 0.08, dh + 0.05, 0.022]} />
          <meshStandardMaterial color="#0e1b2c" roughness={0.5} metalness={0.35} transparent={opacity < 1} opacity={opacity} />
        </mesh>

        {/* Corrugated roll-up steel curtain */}
        <mesh position={[0, dh / 2 + 0.01, 0.016]} castShadow>
          <boxGeometry args={[dw, dh, 0.024]} />
          <meshStandardMaterial
            map={doorTextures.map}
            bumpMap={doorTextures.bump}
            bumpScale={0.035}
            color={pal.door}
            roughness={0.42}
            metalness={0.38}
            emissive={isSelected ? '#c8963e' : '#000000'}
            emissiveIntensity={isSelected ? 0.22 : 0}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>

        {/* Overhead roller shutter drum housing */}
        <mesh position={[0, dh + 0.05, 0.026]} castShadow>
          <boxGeometry args={[dw + 0.1, 0.068, 0.056]} />
          <meshStandardMaterial
            color={isSelected ? '#c8963e' : '#0e1b2c'}
            roughness={0.38}
            metalness={0.5}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>

        {/* Brushed-brass slide latch handle bar (crimson lock bar when OVERLOCKED) */}
        <mesh position={[0, dh * 0.34, 0.034]}>
          <boxGeometry args={[Math.max(0.14, dw * 0.36), 0.032, 0.022]} />
          <meshStandardMaterial
            color={u.status === 'OVERLOCKED' ? '#ff4d3d' : '#ddb065'}
            roughness={0.28}
            metalness={0.72}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>

        {/* Threshold sill plate */}
        <mesh position={[0, 0.009, 0.032]} receiveShadow>
          <boxGeometry args={[dw + 0.12, 0.018, 0.07]} />
          <meshStandardMaterial
            color={isSelected ? '#ddb065' : '#9aa6b4'}
            roughness={0.45}
            metalness={0.45}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>
      </group>
    </group>
  );
});

/** Perimeter cutaway walls, illuminated LỐI VÀO CHÍNH portal, PIN keypad totem & reception/trolley bay. */
function BuildingShell({
  bb,
  zoneName,
  portalSignTex,
  thresholdTex,
  floorTex,
}: {
  bb: PlanBounds;
  zoneName?: string;
  portalSignTex: THREE.CanvasTexture;
  thresholdTex: THREE.CanvasTexture;
  floorTex: THREE.CanvasTexture;
}) {
  const bw = bb.w * WORLD_SCALE;
  const bd = bb.h * WORLD_SCALE;
  const wallH = 0.58;
  const wallT = 0.22;
  const portalW = Math.min(3.4, Math.max(2.5, bw * 0.15));
  const frontSegW = Math.max(0.6, (bw - portalW) / 2);

  React.useEffect(() => {
    floorTex.repeat.set(Math.max(2, bw / 3.2), Math.max(2, bd / 3.2));
    floorTex.needsUpdate = true;
  }, [floorTex, bw, bd]);

  const showFoyerDetails = bw > 9 && bd > 5.5;

  return (
    <group>
      {/* Deep navy architectural presentation plinth */}
      <mesh position={[0, -0.17, 0]} receiveShadow>
        <boxGeometry args={[bw + 1.55, 0.28, bd + 1.55]} />
        <meshStandardMaterial color="#091320" roughness={0.62} metalness={0.18} />
        <Edges color="#1b3350" threshold={15} />
      </mesh>

      {/* Brushed-brass perimeter plinth trim */}
      <mesh position={[0, -0.026, 0]} receiveShadow>
        <boxGeometry args={[bw + 0.72, 0.048, bd + 0.72]} />
        <meshStandardMaterial color="#c8963e" roughness={0.32} metalness={0.68} />
      </mesh>

      {/* Warm polished architectural concrete floor */}
      <mesh position={[0, -0.012, 0]} receiveShadow>
        <boxGeometry args={[bw + 0.2, 0.026, bd + 0.2]} />
        <meshStandardMaterial map={floorTex} color="#fbf8f1" roughness={0.84} metalness={0.02} />
      </mesh>

      {/* Cutaway Perimeter Walls: Back, Left, Right */}
      {/* Back wall (-Z) */}
      <group position={[0, 0, -bd / 2 - wallT / 2]}>
        <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bw + wallT * 2, wallH, wallT]} />
          <meshStandardMaterial color="#0e1b2c" roughness={0.55} metalness={0.15} />
          <Edges color="#223e60" threshold={15} />
        </mesh>
        <mesh position={[0, wallH + 0.022, 0]}>
          <boxGeometry args={[bw + wallT * 2 + 0.04, 0.044, wallT + 0.04]} />
          <meshStandardMaterial color="#c8963e" roughness={0.34} metalness={0.65} />
        </mesh>
      </group>

      {/* Left wall (-X) */}
      <group position={[-bw / 2 - wallT / 2, 0, 0]}>
        <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[wallT, wallH, bd]} />
          <meshStandardMaterial color="#0e1b2c" roughness={0.55} metalness={0.15} />
          <Edges color="#223e60" threshold={15} />
        </mesh>
        <mesh position={[0, wallH + 0.022, 0]}>
          <boxGeometry args={[wallT + 0.04, 0.044, bd + 0.04]} />
          <meshStandardMaterial color="#c8963e" roughness={0.34} metalness={0.65} />
        </mesh>
      </group>

      {/* Right wall (+X) */}
      <group position={[bw / 2 + wallT / 2, 0, 0]}>
        <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[wallT, wallH, bd]} />
          <meshStandardMaterial color="#0e1b2c" roughness={0.55} metalness={0.15} />
          <Edges color="#223e60" threshold={15} />
        </mesh>
        <mesh position={[0, wallH + 0.022, 0]}>
          <boxGeometry args={[wallT + 0.04, 0.044, bd + 0.04]} />
          <meshStandardMaterial color="#c8963e" roughness={0.34} metalness={0.65} />
        </mesh>
      </group>

      {/* Front cutaway walls flanking LỐI VÀO CHÍNH (+Z) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (portalW / 2 + frontSegW / 2), 0, bd / 2 + wallT / 2]}>
          <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[frontSegW, wallH, wallT]} />
            <meshStandardMaterial color="#0e1b2c" roughness={0.55} metalness={0.15} />
            <Edges color="#223e60" threshold={15} />
          </mesh>
          <mesh position={[0, wallH + 0.022, 0]}>
            <boxGeometry args={[frontSegW + 0.02, 0.044, wallT + 0.04]} />
            <meshStandardMaterial color="#c8963e" roughness={0.34} metalness={0.65} />
          </mesh>
        </group>
      ))}

      {/* Grand Illuminated Entrance Portal (LỐI VÀO CHÍNH) */}
      <group position={[0, 0, bd / 2 + wallT / 2]}>
        {/* Left & Right Portal Pillars */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (portalW / 2 + 0.14), 0, 0]}>
            <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.28, 1.84, 0.34]} />
              <meshStandardMaterial color="#0e1b2c" roughness={0.45} metalness={0.25} />
              <Edges color="#c8963e" threshold={15} />
            </mesh>
            {/* Brushed brass front pilaster */}
            <mesh position={[0, 0.92, 0.175]}>
              <boxGeometry args={[0.08, 1.76, 0.025]} />
              <meshStandardMaterial color="#ddb065" roughness={0.28} metalness={0.72} />
            </mesh>
          </group>
        ))}

        {/* Portal Overhead Arch / Canopy Lintel */}
        <mesh position={[0, 1.98, 0.04]} castShadow>
          <boxGeometry args={[portalW + 0.72, 0.42, 0.52]} />
          <meshStandardMaterial color="#0a1523" roughness={0.42} metalness={0.25} />
          <Edges color="#c8963e" threshold={15} />
        </mesh>

        {/* Top Brass Crown */}
        <mesh position={[0, 2.21, 0.04]}>
          <boxGeometry args={[portalW + 0.8, 0.048, 0.58]} />
          <meshStandardMaterial color="#c8963e" roughness={0.3} metalness={0.7} />
        </mesh>

        {/* Warm Underside LED Downlight Strip */}
        <mesh position={[0, 1.765, 0.04]}>
          <boxGeometry args={[portalW - 0.1, 0.025, 0.24]} />
          <meshStandardMaterial color="#ffdf9e" emissive="#ffbe55" emissiveIntensity={1.6} />
        </mesh>

        {/* Front & Interior High-DPI Portal Signboards */}
        <mesh position={[0, 1.98, 0.305]}>
          <planeGeometry args={[portalW + 0.5, 0.34]} />
          <meshBasicMaterial map={portalSignTex} />
        </mesh>
        <mesh position={[0, 1.98, -0.225]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[portalW + 0.5, 0.34]} />
          <meshBasicMaterial map={portalSignTex} />
        </mesh>

        {/* Floor Threshold Welcome Plaque */}
        <mesh position={[0, 0.008, -0.34]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[portalW * 0.86, 0.56]} />
          <meshBasicMaterial map={thresholdTex} polygonOffset polygonOffsetFactor={-2} />
        </mesh>

        {/* Smart PIN Keypad Access Totem (outside right pillar) */}
        <group position={[portalW / 2 + 0.48, 0, 0.36]}>
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[0.11, 0.96, 0.11]} />
            <meshStandardMaterial color="#0e1b2c" roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.98, 0.03]} rotation={[-0.38, 0, 0]} castShadow>
            <boxGeometry args={[0.22, 0.26, 0.1]} />
            <meshStandardMaterial color="#0a1523" roughness={0.35} metalness={0.5} />
            <Edges color="#c8963e" threshold={15} />
          </mesh>
          {/* Glowing PIN screen */}
          <mesh position={[0, 0.995, 0.082]} rotation={[-0.38, 0, 0]}>
            <planeGeometry args={[0.15, 0.18]} />
            <meshStandardMaterial color="#ffd584" emissive="#f0b952" emissiveIntensity={1.25} />
          </mesh>
        </group>

        {/* Reception Desk & Hand-Trolley Bay tucked along inner front foyer */}
        {showFoyerDetails && (
          <>
            {/* Concierge / Reception Desk (left of portal inside foyer) */}
            <group position={[-(portalW / 2 + 0.95), 0, -0.44]}>
              <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.15, 0.56, 0.42]} />
                <meshStandardMaterial color="#0e1b2c" roughness={0.5} metalness={0.2} />
                <Edges color="#29496e" threshold={15} />
              </mesh>
              <mesh position={[0, 0.575, 0]}>
                <boxGeometry args={[1.22, 0.04, 0.48]} />
                <meshStandardMaterial color="#c8963e" roughness={0.32} metalness={0.62} />
              </mesh>
              {/* Miniature check-in terminal */}
              <mesh position={[-0.18, 0.68, -0.04]} rotation={[0.18, 0.2, 0]}>
                <boxGeometry args={[0.26, 0.18, 0.03]} />
                <meshStandardMaterial color="#142842" emissive="#2f6fb0" emissiveIntensity={0.35} />
              </mesh>
            </group>

            {/* Hand-Trolley Parking Bay (right of portal inside foyer) */}
            <group position={[portalW / 2 + 0.92, 0, -0.42]}>
              {/* Painted brass floor bay */}
              <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.15, 0.52]} />
                <meshBasicMaterial color="#c8963e" transparent opacity={0.22} />
              </mesh>
              {[-0.28, 0.28].map((tx, idx) => (
                <group key={idx} position={[tx, 0, 0]}>
                  {/* Trolley flatbed */}
                  <mesh position={[0, 0.09, 0]} castShadow>
                    <boxGeometry args={[0.38, 0.04, 0.42]} />
                    <meshStandardMaterial color="#16385d" roughness={0.5} metalness={0.3} />
                  </mesh>
                  {/* Brass push handle */}
                  <mesh position={[0, 0.3, 0.18]} castShadow>
                    <boxGeometry args={[0.34, 0.42, 0.03]} />
                    <meshStandardMaterial color="#ddb065" roughness={0.3} metalness={0.75} />
                  </mesh>
                </group>
              ))}
            </group>
          </>
        )}
      </group>
    </group>
  );
}

/** Glowing 3D Golden Wayfinding Tube + Animated Flowing Chevron/Orb Markers + Bobbing Destination Pin. */
function WayfindingPath3D({
  route,
  cx0,
  cy0,
  selectedUnit,
  onPrimaryAction,
  primaryActionLabel,
}: {
  route: WayfindingResult;
  cx0: number;
  cy0: number;
  selectedUnit: any;
  onPrimaryAction?: (u: any) => void;
  primaryActionLabel?: string;
}) {
  const curve = React.useMemo(() => buildFilletedCurve3D(route.waypoints, cx0, cy0, 0.085), [route.waypoints, cx0, cy0]);
  const glowCurve = React.useMemo(() => buildFilletedCurve3D(route.waypoints, cx0, cy0, 0.025), [route.waypoints, cx0, cy0]);

  const { coreTube, glowTube, totalLength } = React.useMemo(() => {
    if (!curve || !glowCurve) return { coreTube: null, glowTube: null, totalLength: 0 };
    const len = curve.getLength();
    const tubularSegs = Math.min(260, Math.max(48, Math.round(len * 14)));
    const core = new THREE.TubeGeometry(curve, tubularSegs, 0.052, 10, false);
    const glow = new THREE.TubeGeometry(glowCurve, tubularSegs, 0.15, 8, false);
    glow.scale(1, 0.14, 1);
    return { coreTube: core, glowTube: glow, totalLength: len };
  }, [curve, glowCurve]);

  React.useEffect(() => {
    return () => {
      coreTube?.dispose();
      glowTube?.dispose();
    };
  }, [coreTube, glowTube]);

  const markerCount = React.useMemo(() => Math.min(18, Math.max(5, Math.round(totalLength / 1.15))), [totalLength]);
  const markersRef = React.useRef<Array<THREE.Group | null>>([]);
  const startPulseRef = React.useRef<THREE.Mesh>(null);
  const destBeaconRef = React.useRef<THREE.Group>(null);

  const startWorld = React.useMemo(
    () => new THREE.Vector3((route.entrance.x - cx0) * WORLD_SCALE, 0.02, (route.entrance.y - cy0) * WORLD_SCALE),
    [route.entrance, cx0, cy0],
  );

  const unitCenterWorld = React.useMemo(() => {
    const s = selectedUnit.shape;
    const rawHm = Number(selectedUnit.type?.height_m ?? selectedUnit.unit_type?.height_m ?? 2.4) || 2.4;
    const h3d = THREE.MathUtils.clamp(rawHm * 0.44, 0.56, 1.56);
    return new THREE.Vector3(
      (s.x + s.w / 2 - cx0) * WORLD_SCALE,
      h3d,
      (s.y + s.h / 2 - cy0) * WORLD_SCALE,
    );
  }, [selectedUnit, cx0, cy0]);

  const upVec = React.useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const lookMat = React.useMemo(() => new THREE.Matrix4(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (curve && totalLength > 0.05) {
      const speed = 0.22;
      for (let i = 0; i < markerCount; i++) {
        const grp = markersRef.current[i];
        if (!grp) continue;
        const u = ((i / markerCount) + (t * speed) / Math.max(1, totalLength * 0.16)) % 1;
        const pt = curve.getPointAt(u);
        const tan = curve.getTangentAt(u);
        grp.position.set(pt.x, pt.y + 0.055, pt.z);
        lookMat.lookAt(pt, pt.clone().add(tan), upVec);
        grp.quaternion.setFromRotationMatrix(lookMat);
        // Smooth fade-in/out near portals
        const edgeScale = Math.min(1, u * 12, (1 - u) * 12);
        grp.scale.setScalar(Math.max(0.001, edgeScale));
      }
    }

    if (startPulseRef.current) {
      const p = (t * 0.9) % 1;
      const sc = 1 + p * 1.45;
      startPulseRef.current.scale.set(sc, sc, 1);
      const mat = startPulseRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - p) * 0.65;
    }

    if (destBeaconRef.current) {
      destBeaconRef.current.position.y = unitCenterWorld.y + 0.44 + Math.sin(t * 3.2) * 0.075;
      destBeaconRef.current.rotation.y = t * 1.4;
    }
  });

  if (!coreTube || !glowTube) return null;

  const statusLabel = STATUS.unit[selectedUnit.status]?.[0] ?? selectedUnit.status;

  return (
    <group>
      {/* Soft floor aura ribbon */}
      <mesh geometry={glowTube}>
        <meshBasicMaterial color="#ddb065" transparent opacity={0.34} depthWrite={false} />
      </mesh>

      {/* Luminous 3D golden-brass wayfinding core tube */}
      <mesh geometry={coreTube} castShadow>
        <meshStandardMaterial
          color="#f7c868"
          emissive="#c8963e"
          emissiveIntensity={0.62}
          roughness={0.24}
          metalness={0.5}
        />
      </mesh>

      {/* Animated flowing chevron/orb markers along the corridor path */}
      {Array.from({ length: markerCount }).map((_, i) => (
        <group key={i} ref={(el) => { markersRef.current[i] = el; }}>
          {/* Forward-pointing golden cone chevron */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.085, 0.22, 4]} />
            <meshStandardMaterial color="#fff3d1" emissive="#f0b952" emissiveIntensity={1.1} roughness={0.2} />
          </mesh>
          {/* Trailing pearl orb */}
          <mesh position={[0, 0, 0.11]}>
            <sphereGeometry args={[0.042, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}

      {/* Entrance Start Beacon (LỐI VÀO) */}
      <group position={[startWorld.x, 0.025, startWorld.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.25, 28]} />
          <meshBasicMaterial color="#f0b952" side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={startPulseRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.28, 28]} />
          <meshBasicMaterial color="#ddb065" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#fff3d1" emissive="#c8963e" emissiveIntensity={0.95} />
        </mesh>
      </group>

      {/* Bobbing 3D Destination Diamond Pointer above target unit */}
      <group ref={destBeaconRef} position={[unitCenterWorld.x, unitCenterWorld.y + 0.44, unitCenterWorld.z]}>
        <mesh rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.16, 0.34, 4]} />
          <meshStandardMaterial color="#f6c463" emissive="#c8963e" emissiveIntensity={0.75} metalness={0.55} roughness={0.2} />
          <Edges color="#ffffff" threshold={15} />
        </mesh>
      </group>

      {/* Single crisp floating HTML destination badge */}
      <Html
        position={[unitCenterWorld.x, unitCenterWorld.y + 0.88, unitCenterWorld.z]}
        center
        zIndexRange={[18, 0]}
        style={{ pointerEvents: onPrimaryAction ? 'auto' : 'none' }}
      >
        <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-brass-400/70 bg-ink-950/92 px-3 py-1.5 text-xs text-white shadow-[0_10px_28px_rgb(8_18_31/0.55)] backdrop-blur-md">
          <span className="size-2 rounded-full bg-brass-400 shadow-[0_0_8px_#ddb065]" />
          <span className="font-mono font-bold tracking-tight text-brass-400">Kho {selectedUnit.code}</span>
          <span className="text-white/35">·</span>
          <span className="font-semibold num">{route.distanceM} m</span>
          <span className="hidden text-steel-300 sm:inline">({statusLabel})</span>
          {onPrimaryAction && primaryActionLabel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrimaryAction(selectedUnit);
              }}
              className="ml-1 rounded-full bg-brass-500 px-2.5 py-0.5 text-[11px] font-bold text-ink-950 transition hover:bg-brass-400"
            >
              {primaryActionLabel}
            </button>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Smooth camera preset controller integrated harmoniously with OrbitControls. */
function CameraRig({
  preset,
  presetTrigger,
  bb,
  route,
  selectedUnit,
}: {
  preset: CameraPreset;
  presetTrigger: number;
  bb: PlanBounds;
  route: WayfindingResult | null;
  selectedUnit: any | null;
}) {
  const { camera } = useThree();
  const controlsRef = React.useRef<any>(null);
  const anim = React.useRef<{ pos: THREE.Vector3; target: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(0, 16, 20),
    target: new THREE.Vector3(0, 0, 0),
    active: true,
  });

  const cx0 = bb.x + bb.w / 2;
  const cy0 = bb.y + bb.h / 2;
  const bw = bb.w * WORLD_SCALE;
  const bd = bb.h * WORLD_SCALE;
  const span = Math.max(bw, bd, 12);

  React.useEffect(() => {
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0.2, 0);

    if (preset === 'top') {
      pos.set(0, span * 1.38, 0.04);
      target.set(0, 0, 0);
    } else if (preset === 'entrance') {
      pos.set(0, Math.max(3.6, span * 0.22), bd / 2 + Math.max(5.8, span * 0.34));
      if (selectedUnit?.shape) {
        const s = selectedUnit.shape;
        target.set(((s.x + s.w / 2 - cx0) * WORLD_SCALE) * 0.55, 0.35, ((s.y + s.h / 2 - cy0) * WORLD_SCALE) * 0.55);
      } else {
        target.set(0, 0.35, -bd * 0.15);
      }
    } else if (preset === 'route' && selectedUnit?.shape) {
      const s = selectedUnit.shape;
      const ux = (s.x + s.w / 2 - cx0) * WORLD_SCALE;
      const uz = (s.y + s.h / 2 - cy0) * WORLD_SCALE;
      const ex = route ? (route.entrance.x - cx0) * WORLD_SCALE : 0;
      const ez = route ? (route.entrance.y - cy0) * WORLD_SCALE : bd / 2;
      const mx = (ux + ex) * 0.5;
      const mz = (uz + ez) * 0.5;
      const dist = Math.max(7, Math.hypot(ux - ex, uz - ez));
      target.set(mx, 0.25, mz);
      pos.set(mx + (ux >= ex ? -dist * 0.42 : dist * 0.42), Math.max(5.5, dist * 0.68), mz + dist * 0.72);
    } else {
      // 'overview' 3/4 architectural isometric perspective
      pos.set(span * 0.52, span * 0.72, span * 0.86);
      target.set(0, 0.1, 0);
    }

    anim.current = { pos, target, active: true };
  }, [preset, presetTrigger, span, bd, cx0, cy0, preset === 'route' ? selectedUnit?.id : null]);

  useFrame((_, dt) => {
    if (!anim.current.active) return;
    const k = 1 - Math.pow(0.0018, dt);
    camera.position.lerp(anim.current.pos, k);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(anim.current.target, k);
      controlsRef.current.update();
    } else {
      camera.lookAt(anim.current.target);
    }
    if (
      camera.position.distanceTo(anim.current.pos) < 0.08 &&
      (!controlsRef.current || controlsRef.current.target.distanceTo(anim.current.target) < 0.08)
    ) {
      anim.current.active = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={3.5}
      maxDistance={span * 2.4}
      maxPolarAngle={Math.PI / 2 - 0.06}
      minPolarAngle={0.05}
      onStart={() => {
        anim.current.active = false;
      }}
    />
  );
}

function ArchitecturalScene({
  zoneName,
  units,
  bb,
  selectedUnit,
  onSelectUnit,
  route,
  filterStatus,
  searchQuery,
  preset,
  presetTrigger,
  onPrimaryAction,
  primaryActionLabel,
}: FloorPlan3DProps & { preset: CameraPreset; presetTrigger: number }) {
  const cx0 = bb.x + bb.w / 2;
  const cy0 = bb.y + bb.h / 2;
  const bw = bb.w * WORLD_SCALE;
  const bd = bb.h * WORLD_SCALE;
  const span = Math.max(bw, bd, 14);

  const floorTex = React.useMemo(createConcreteFloorTexture, []);
  const doorTextures = React.useMemo(createDoorCorrugationTextures, []);
  const portalSignTex = React.useMemo(createPortalSignTexture, []);
  const thresholdTex = React.useMemo(() => createFloorThresholdTexture(zoneName || 'KHU LƯU TRỮ'), [zoneName]);

  const roofCacheRef = React.useRef<Map<string, THREE.CanvasTexture>>(new Map());
  const getRoofTexture = React.useCallback((key: string, create: () => THREE.CanvasTexture) => {
    let tex = roofCacheRef.current.get(key);
    if (!tex) {
      tex = create();
      roofCacheRef.current.set(key, tex);
    }
    return tex;
  }, []);

  React.useEffect(() => {
    return () => {
      floorTex.dispose();
      doorTextures.map.dispose();
      doorTextures.bump.dispose();
      portalSignTex.dispose();
    };
  }, [floorTex, doorTextures, portalSignTex]);

  React.useEffect(() => {
    return () => {
      thresholdTex.dispose();
    };
  }, [thresholdTex]);

  React.useEffect(() => {
    const cache = roofCacheRef.current;
    return () => {
      cache.forEach((t) => t.dispose());
      cache.clear();
    };
  }, []);

  const q = (searchQuery ?? '').trim().toLowerCase();

  return (
    <>
      <CameraRig preset={preset} presetTrigger={presetTrigger} bb={bb} route={route} selectedUnit={selectedUnit} />

      {/* Studio Architectural Lighting (zero external HDRI/CDN dependencies) */}
      <ambientLight intensity={0.85} color="#fff7ec" />
      <hemisphereLight args={['#f5f8ff', '#2a2118', 0.48]} />
      <directionalLight
        position={[span * 0.65, span * 1.1, span * 0.55]}
        intensity={1.95}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 0.85}
        shadow-camera-right={span * 0.85}
        shadow-camera-top={span * 0.85}
        shadow-camera-bottom={-span * 0.85}
        shadow-camera-near={1}
        shadow-camera-far={span * 3}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-span * 0.7, span * 0.6, -span * 0.5]} intensity={0.62} color="#dce8ff" />
      {/* Warm brass welcome light inside LỐI VÀO CHÍNH */}
      <pointLight position={[0, 1.7, bd / 2]} intensity={3.2} distance={8} decay={1.6} color="#ffcf82" />

      <BuildingShell
        bb={bb}
        zoneName={zoneName}
        portalSignTex={portalSignTex}
        thresholdTex={thresholdTex}
        floorTex={floorTex}
      />

      {/* 3D Storage Units */}
      {units.map((u) => {
        if (!u?.shape) return null;
        const dimmed =
          Boolean(filterStatus && u.status !== filterStatus) ||
          Boolean(q && !String(u.code).toLowerCase().includes(q));
        const isSelected = Boolean(selectedUnit && String(selectedUnit.id) === String(u.id));
        return (
          <StorageUnitMesh
            key={u.id}
            u={u}
            cx0={cx0}
            cy0={cy0}
            isSelected={isSelected}
            isDimmed={dimmed}
            doorTextures={doorTextures}
            getRoofTexture={getRoofTexture}
            onSelect={onSelectUnit}
          />
        );
      })}

      {/* Live 3D Wayfinding Ribbon & Animated Flowing Chevrons */}
      {route && selectedUnit?.shape && (
        <WayfindingPath3D
          route={route}
          cx0={cx0}
          cy0={cy0}
          selectedUnit={selectedUnit}
          onPrimaryAction={onPrimaryAction}
          primaryActionLabel={primaryActionLabel}
        />
      )}

      <ContactShadows
        position={[0, -0.31, 0]}
        opacity={0.38}
        scale={span * 1.65}
        blur={2.8}
        far={2.5}
        resolution={512}
        color="#050b14"
        frames={1}
      />
    </>
  );
}

const PRESETS: Array<{ id: CameraPreset; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Toàn cảnh', icon: Compass },
  { id: 'entrance', label: 'Lối vào', icon: Eye },
  { id: 'top', label: 'Mặt bằng', icon: Layers },
  { id: 'route', label: 'Lộ trình', icon: Navigation },
];

export default function FloorPlan3D(props: FloorPlan3DProps) {
  const [preset, setPreset] = React.useState<CameraPreset>('overview');
  const [presetTrigger, setPresetTrigger] = React.useState(0);

  const pickPreset = (p: CameraPreset) => {
    setPreset(p);
    setPresetTrigger((n) => n + 1);
  };

  return (
    <div
      className={cn(
        'relative h-[440px] w-full overflow-hidden select-none sm:h-[520px]',
        props.dark
          ? 'bg-[radial-gradient(120%_95%_at_50%_20%,#162b46_0%,#08121f_72%,#050b14_100%)]'
          : 'bg-[radial-gradient(120%_95%_at_50%_15%,#f7f3ea_0%,#e7e0d2_75%,#dcd3c1_100%)]',
        props.className,
      )}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 36, near: 0.1, far: 220, position: [14, 18, 22] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
        }}
      >
        <ArchitecturalScene {...props} preset={preset} presetTrigger={presetTrigger} />
      </Canvas>

      {/* Compact Camera Switcher */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <div className="pointer-events-auto inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/12 bg-ink-950/75 p-1 shadow-md backdrop-blur-md">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  active
                    ? 'bg-brass-500 text-ink-950 shadow-xs'
                    : 'text-steel-200 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="size-3.5" />
                <span>{p.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            title="Đặt lại góc nhìn"
            onClick={() => pickPreset('overview')}
            className="grid size-7 place-items-center rounded-lg text-steel-300 transition hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
