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

function formatPrimarySettlementGradDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingBookingSizeCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type LedgerBranchOccupancyMetricFloorPlanDTag = 'flow5' | 'active' | 'settled';

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
