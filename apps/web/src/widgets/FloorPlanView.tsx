import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  Ban,
  Box,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  Footprints,
  KeyRound,
  Layers,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  Thermometer,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Async, Badge, Button, Card, ErrorState, Skeleton, Tabs, cn } from '@/ui';
import { SIZE_LABEL, STATUS, vnd } from '@/lib/format';
import { layoutUnits } from '@/lib/planLayout';
import { computePlanBounds, findUnitWayfinding, type PlanBounds, type StepKind, type WayfindingResult } from '@/lib/wayfinding';


class TenantLiquidationPickDefaultUnitCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow5:liquidation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSecondaryZoneNormalizeZoneUnitsWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}
const FloorPlan3D = lazy(() => import('./FloorPlan3D'));

/** High-contrast accessible floor plan palette: distinct hue + value + pattern for low-vision clarity. */
const TONE: Record<string, { fill: string; stroke: string; ink: string; label: string }> = {
  AVAILABLE: { fill: '#FFFFFF', stroke: '#0F2A4A', ink: '#0E1B2C', label: 'Trống' },
  RESERVED: { fill: '#BFDBFE', stroke: '#1D4ED8', ink: '#172554', label: 'Đã giữ' },
  OCCUPIED: { fill: '#FDE68A', stroke: '#B45309', ink: '#451A03', label: 'Đang thuê' },
  OVERLOCKED: { fill: '#FECACA', stroke: '#DC2626', ink: '#450A0A', label: 'Khóa chặn' },
  PENDING_INSPECTION: { fill: '#FBCFE8', stroke: '#BE185D', ink: '#500724', label: 'Chờ kiểm tra' },
  MAINTENANCE: { fill: '#E9D5FF', stroke: '#7E22CE', ink: '#3B0764', label: 'Bảo trì' },
  OUT_OF_SERVICE: { fill: '#CBD5E1', stroke: '#475569', ink: '#0F172A', label: 'Ngưng dùng' },
  RETIRED: { fill: '#CBD5E1', stroke: '#475569', ink: '#0F172A', label: 'Đã loại bỏ' },
};

const ORDER = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'OVERLOCKED', 'PENDING_INSPECTION', 'MAINTENANCE', 'OUT_OF_SERVICE'];

export interface PublicFloorPlanExplorerProps {
  facilitySlug?: string;
  initialUnitCode?: string;
  dark?: boolean;
  className?: string;
}
