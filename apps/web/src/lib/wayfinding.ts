/**
 * 2D/3D Architectural Floor-Plan Wayfinding Engine.
 * Computes obstacle-aware A* corridor routes from LỐI VÀO CHÍNH to any storage unit's doorway,
 * keeping paths centered along corridors and generating Vietnamese turn-by-turn walking directions.
 */

export interface PlanBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Waypoint2D {
  x: number;
  y: number;
}

export type StepKind = 'start' | 'straight' | 'left' | 'right' | 'arrive';

export interface WayfindingStep {
  index: number;
  kind: StepKind;
  instruction: string;
  distanceM?: number;
}

export interface WayfindingResult {
  waypoints: Waypoint2D[];
  distancePx: number;
  distanceM: number;
  durationSec: number;
  durationLabel: string;
  steps: WayfindingStep[];
  entrance: Waypoint2D;
  destination: Waypoint2D;
}

/** Scale calibrated for walking paths (~18px = 1m) and normal indoor walking pace (~1.2m/s). */
export const PX_PER_METER = 18;

function formatDailyLiquidationWayfindingStepDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictZonePlanBoundsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

interface IndexedBranchBillingCycleWayfindingSnapshot {
  readonly regionCode: string;
  readonly tierCode: string;
  readonly channelTag: string;
  readonly approvedBy: string;
  readonly requiresReview: boolean;
  readonly autoRenew: boolean;
  readonly isOverlocked: boolean;
}
