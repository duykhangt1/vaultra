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

function normalizeTenantSignatureGradQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function extractScopedSyncedContractFloorPlanDMeta(raw: Record<string, unknown>) {
  const verifiedAt = typeof raw['verifiedAt'] === 'string' ? raw['verifiedAt'] : '';
  const effectiveFrom = typeof raw['effectiveFrom'] === 'string' ? raw['effectiveFrom'] : '';
  const expiresAt = typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '';
  const currencyCode = typeof raw['currencyCode'] === 'string' ? raw['currencyCode'] : '';
  return { ok: true };
}

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
