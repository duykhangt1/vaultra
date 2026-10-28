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

/** Signed distance (> 0 outside, <= 0 inside) from point (px, py) to an uninflated obstacle rectangle. */
function signedDistToObstacle(px: number, py: number, o: ObstacleRect): number {
  const dx = px - o.cx;
  const dy = py - o.cy;
  // Inverse rotation (-rad) brings world point into unrotated unit space
  const lx = o.cx + dx * o.cos + dy * o.sin;
  const ly = o.cy - dx * o.sin + dy * o.cos;
  const qx = Math.max(o.x - lx, 0, lx - (o.x + o.w));
  const qy = Math.max(o.y - ly, 0, ly - (o.y + o.h));
  if (qx > 0 || qy > 0) return Math.hypot(qx, qy);
  const insideX = Math.min(lx - o.x, o.x + o.w - lx);
  const insideY = Math.min(ly - o.y, o.y + o.h - ly);
  return -Math.min(insideX, insideY);
}

function isBlocked(px: number, py: number, obstacles: ObstacleRect[], bb: PlanBounds, margin: number): boolean {
  if (px < bb.x + 3 || px > bb.x + bb.w - 3 || py < bb.y + 3 || py > bb.y + bb.h - 3) return true;
  for (const o of obstacles) {
    const m = o.isTarget ? Math.min(margin, 1.5) : margin;
    if (signedDistToObstacle(px, py, o) < m) return true;
  }
  return false;
}

function minClearance(px: number, py: number, obstacles: ObstacleRect[], bb: PlanBounds): number {
  let minD = Math.min(px - bb.x, bb.x + bb.w - px, py - bb.y, bb.y + bb.h - py);
  for (const o of obstacles) {
    const d = signedDistToObstacle(px, py, o);
    if (d < minD) minD = d;
  }
  return minD;
}

/** Builds sorted grid axis coordinates (~12px step) enriched with exact corridor midlines & pin endpoints. */
function buildAxisCoords(minBound: number, maxBound: number, step: number, pinned: number[], edges: Array<[number, number]>): number[] {
  const raw: number[] = [];
  for (let v = minBound + 8; v <= maxBound - 8; v += step) raw.push(v);
  // Inject corridor centerlines between adjacent unit edges (10px..90px wide)
  const flatStarts = edges.map((e) => e[0]).sort((a, b) => a - b);
  const flatEnds = edges.map((e) => e[1]).sort((a, b) => a - b);
  for (const endVal of flatEnds) {
    for (const startVal of flatStarts) {
      const gap = startVal - endVal;
      if (gap >= 10 && gap <= 90) {
        raw.push((endVal + startVal) * 0.5);
        break;
      }
    }
  }
  // Outer aisle centerlines
  if (flatStarts.length) {
    const first = flatStarts[0];
    if (first - minBound >= 12) raw.push((minBound + first) * 0.5);
  }
  if (flatEnds.length) {
    const last = flatEnds[flatEnds.length - 1];
    if (maxBound - last >= 12) raw.push((last + maxBound) * 0.5);
  }

  raw.sort((a, b) => a - b);
  const merged: number[] = [...pinned];
  for (const v of raw) {
    if (v <= minBound + 3 || v >= maxBound - 3) continue;
    if (merged.every((m) => Math.abs(m - v) >= 2.8)) merged.push(v);
  }
  merged.sort((a, b) => a - b);
  return merged;
}

/** Binary min-heap for fast A* open-set priority queue. */
class MinHeap {
  private ids: number[] = [];
  private fs: number[] = [];

  get size() {
    return this.ids.length;
  }

  push(id: number, f: number) {
    const { ids, fs } = this;
    let i = ids.length;
    ids.push(id);
    fs.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p] <= f) break;
      ids[i] = ids[p];
      fs[i] = fs[p];
      i = p;
    }
    ids[i] = id;
    fs[i] = f;
  }

  pop(): number {
    const { ids, fs } = this;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastF = fs.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        if (l >= n) break;
        const m = r < n && fs[r] < fs[l] ? r : l;
        if (lastF <= fs[m]) break;
        ids[i] = ids[m];
        fs[i] = fs[m];
        i = m;
      }
      ids[i] = lastId;
      fs[i] = lastF;
    }
    return top;
  }
}
