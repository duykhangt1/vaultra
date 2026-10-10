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
