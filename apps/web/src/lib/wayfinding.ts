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
export const WALK_SPEED_MPS = 1.2;

/** Computes the shared building envelope bounding box around all positioned units. */
export function computePlanBounds(units: any[], plan?: { width?: number; height?: number } | null): PlanBounds {
  const placed = (units ?? []).filter((u) => u?.shape);
  if (!placed.length) {
    return { x: 0, y: 0, w: plan?.width && plan.width >= 200 ? plan.width : 1200, h: plan?.height && plan.height >= 200 ? plan.height : 700 };
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of placed) {
    const s = u.shape;
    const rot = ((s.rotation ?? 0) % 360 + 360) % 360;
    if (rot === 0) {
      xs.push(s.x, s.x + s.w);
      ys.push(s.y, s.y + s.h);
    } else {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      for (const [px, py] of [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]]) {
        const p = rotatePoint2D(px, py, cx, cy, rot);
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  const pad = 36;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad - 22;
  return {
    x,
    y,
    w: Math.max(...xs) + pad - x,
    h: Math.max(...ys) + pad + 26 - y,
  };
}

/** Rotates (px, py) clockwise in SVG screen coordinates (+x right, +y down) around (cx, cy). */
export function rotatePoint2D(px: number, py: number, cx: number, cy: number, deg = 0): Waypoint2D {
  if (!deg) return { x: px, y: py };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/** Computes a unit's center, front roll-up door threshold, and corridor approach point(s). */
export function unitDoorPoints(u: any): {
  center: Waypoint2D;
  threshold: Waypoint2D;
  approach: Waypoint2D;
  approachCandidates: Waypoint2D[];
} {
  const s = u.shape;
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const rot = s.rotation ?? 0;
  const threshold = rotatePoint2D(cx, s.y + s.h + 2, cx, cy, rot);
  const approach = rotatePoint2D(cx, s.y + s.h + 14, cx, cy, rot);
  const approachCandidates = [14, 11, 8, 18].map((off) => rotatePoint2D(cx, s.y + s.h + off, cx, cy, rot));
  return { center: { x: cx, y: cy }, threshold, approach, approachCandidates };
}

interface ObstacleRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  isTarget: boolean;
}

function buildObstacles(units: any[], targetId: string): ObstacleRect[] {
  const out: ObstacleRect[] = [];
  for (const u of units) {
    if (!u?.shape) continue;
    const s = u.shape;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const rad = ((s.rotation ?? 0) * Math.PI) / 180;
    out.push({
      id: String(u.id),
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      cx,
      cy,
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      isTarget: String(u.id) === String(targetId),
    });
  }
  return out;
}
