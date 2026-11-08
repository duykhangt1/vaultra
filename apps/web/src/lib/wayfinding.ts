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

const DIRS_4: ReadonlyArray<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const DIRS_8: ReadonlyArray<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function runAStar(
  xs: number[],
  ys: number[],
  startIdx: [number, number],
  goalIdx: [number, number],
  obstacles: ObstacleRect[],
  bb: PlanBounds,
  margin: number,
  allowDiagonal: boolean,
): Waypoint2D[] | null {
  const cols = xs.length;
  const rows = ys.length;
  const totalNodes = cols * rows;
  const walkable = new Uint8Array(totalNodes);
  const clearancePenalty = new Float32Array(totalNodes);

  const sNode = startIdx[1] * cols + startIdx[0];
  const gNode = goalIdx[1] * cols + goalIdx[0];

  for (let r = 0; r < rows; r++) {
    const py = ys[r];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const px = xs[c];
      if (idx === sNode || idx === gNode || !isBlocked(px, py, obstacles, bb, margin)) {
        walkable[idx] = 1;
        const clr = minClearance(px, py, obstacles, bb);
        // Gentle centering repulsion within 18px of walls keeps routes cleanly centered in corridors
        clearancePenalty[idx] = clr < 18 ? Math.max(0, 18 - clr) * 0.22 : 0;
      }
    }
  }

  // State space includes incoming direction (0..8, where 8 = initial north-facing from entrance)
  // so a modest turn penalty produces clean architectural 90° corridor segments instead of stair-steps.
  const D = 9;
  const stateCount = totalNodes * D;
  const gScore = new Float32Array(stateCount);
  gScore.fill(Infinity);
  const parent = new Int32Array(stateCount);
  parent.fill(-1);
  const closed = new Uint8Array(stateCount);

  const dirs = allowDiagonal ? DIRS_8 : DIRS_4;
  // Initial heading from LỐI VÀO CHÍNH is straight inward (0, -1) => dir 0
  const initState = sNode * D + 0;
  gScore[initState] = 0;

  const gx = xs[goalIdx[0]];
  const gy = ys[goalIdx[1]];
  const heuristic = (c: number, r: number) =>
    allowDiagonal ? Math.hypot(gx - xs[c], gy - ys[r]) : Math.abs(gx - xs[c]) + Math.abs(gy - ys[r]);

  const open = new MinHeap();
  open.push(initState, heuristic(startIdx[0], startIdx[1]));

  let goalState = -1;

  while (open.size > 0) {
    const curState = open.pop();
    if (closed[curState]) continue;
    closed[curState] = 1;

    const curNode = Math.floor(curState / D);
    if (curNode === gNode) {
      goalState = curState;
      break;
    }

    const curDir = curState % D;
    const cr = Math.floor(curNode / cols);
    const cc = curNode % cols;
    const x1 = xs[cc];
    const y1 = ys[cr];
    const curG = gScore[curState];

    for (let di = 0; di < dirs.length; di++) {
      const [dc, dr] = dirs[di];
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nextNode = nr * cols + nc;
      if (!walkable[nextNode]) continue;

      const x2 = xs[nc];
      const y2 = ys[nr];
      // Verify midpoint & quarter-points along the grid segment do not clip an obstacle corner
      if (nextNode !== gNode && curNode !== sNode) {
        const mx = (x1 + x2) * 0.5;
        const my = (y1 + y2) * 0.5;
        if (isBlocked(mx, my, obstacles, bb, margin)) continue;
        if (Math.hypot(x2 - x1, y2 - y1) > 10) {
          if (
            isBlocked(x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25, obstacles, bb, margin) ||
            isBlocked(x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75, obstacles, bb, margin)
          ) {
            continue;
          }
        }
      }

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const diagFactor = di >= 4 ? 1.06 : 1.0;
      const turnCost = curDir !== di ? 4.5 : 0;
      const stepPenalty = (clearancePenalty[curNode] + clearancePenalty[nextNode]) * 0.5 * (dist / 12);
      const tentativeG = curG + dist * diagFactor + turnCost + stepPenalty;

      const nextState = nextNode * D + di;
      if (tentativeG < gScore[nextState]) {
        gScore[nextState] = tentativeG;
        parent[nextState] = curState;
        open.push(nextState, tentativeG + heuristic(nc, nr));
      }
    }
  }

  if (goalState < 0) return null;

  const rev: Waypoint2D[] = [];
  let st = goalState;
  while (st >= 0) {
    const nd = Math.floor(st / D);
    const r = Math.floor(nd / cols);
    const c = nd % cols;
    rev.push({ x: xs[c], y: ys[r] });
    st = parent[st];
  }
  rev.reverse();
  return rev;
}

/** Merges duplicate and collinear consecutive waypoints while preserving crisp corridor bends. */
export function simplifyWaypoints(pts: Waypoint2D[]): Waypoint2D[] {
  if (pts.length <= 2) return pts;
  const dedup: Waypoint2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = dedup[dedup.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 0.6) {
      dedup.push(pts[i]);
    }
  }
  if (dedup.length <= 2) return dedup;

  const out: Waypoint2D[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1];
    const b = dedup[i];
    const c = dedup[i + 1];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const cross = (v1x * v2y - v1y * v2x) / (l1 * l2);
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    if (Math.abs(cross) < 0.035 && dot > 0.95) {
      // Collinear in the exact same heading -> skip intermediate point b
      continue;
    }
    out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

export function formatWalkingDuration(seconds: number): string {
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds))} giây`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem >= 10 ? `~${mins} phút ${rem} giây` : `~${mins} phút`;
}

function fmtMeters(px: number): number {
  return Math.max(0.5, Math.round((px / PX_PER_METER) * 10) / 10);
}

/** Builds clear Vietnamese indoor turn-by-turn directions from simplified corridor waypoints. */
function buildVietnameseSteps(waypoints: Waypoint2D[], unitCode: string, doorInward: Waypoint2D): WayfindingStep[] {
  const steps: WayfindingStep[] = [
    {
      index: 1,
      kind: 'start',
      instruction: 'Vào từ Cổng chính / Quầy lễ tân',
    },
  ];

  interface Seg {
    dx: number;
    dy: number;
    len: number;
    ux: number;
    uy: number;
  }
  const rawSegs: Seg[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const len = Math.hypot(dx, dy);
    if (len > 1) rawSegs.push({ dx, dy, len, ux: dx / len, uy: dy / len });
  }

  // Merge consecutive segments with near-identical direction
  const segs: Seg[] = [];
  for (const s of rawSegs) {
    const prev = segs[segs.length - 1];
    if (prev) {
      const cross = prev.ux * s.uy - prev.uy * s.ux;
      const dot = prev.ux * s.ux + prev.uy * s.uy;
      if (Math.abs(cross) < 0.22 && dot > 0.9) {
        const ndx = prev.dx + s.dx;
        const ndy = prev.dy + s.dy;
        const nlen = prev.len + s.len;
        const mag = Math.hypot(ndx, ndy) || 1;
        segs[segs.length - 1] = { dx: ndx, dy: ndy, len: nlen, ux: ndx / mag, uy: ndy / mag };
        continue;
      }
    }
    segs.push(s);
  }

  // Determine if the very last segment is just the short (< 26px ≈ 1.4m) doorway threshold step-in
  const hasShortDoorTurnIn = segs.length >= 2 && segs[segs.length - 1].len < 26;
  const walkSegs = hasShortDoorTurnIn ? segs.slice(0, -1) : segs;

  // Visitor starts facing straight inward from LỐI VÀO CHÍNH: (0, -1)
  let prevUx = 0;
  let prevUy = -1;
  let emittedFirstWalk = false;

  for (let i = 0; i < walkSegs.length; i++) {
    const s = walkSegs[i];
    // Skip tiny initial portal step if an immediate foyer turn follows
    if (i === 0 && s.len < 22 && walkSegs.length > 1) {
      prevUx = s.ux;
      prevUy = s.uy;
      continue;
    }
    if (s.len < 9) continue;

    const m = fmtMeters(s.len);
    const cross = prevUx * s.uy - prevUy * s.ux;
    const dot = prevUx * s.ux + prevUy * s.uy;

    if (!emittedFirstWalk && dot > 0.85 && Math.abs(cross) <= 0.35) {
      steps.push({
        index: steps.length + 1,
        kind: 'straight',
        distanceM: m,
        instruction: `Đi thẳng ${m} m dọc hành lang`,
      });
    } else if (Math.abs(cross) <= 0.28 && dot > 0.85) {
      steps.push({
        index: steps.length + 1,
        kind: 'straight',
        distanceM: m,
        instruction: `Đi thẳng ${m} m dọc hành lang`,
      });
    } else if (cross < 0) {
      steps.push({
        index: steps.length + 1,
        kind: 'left',
        distanceM: m,
        instruction: `Rẽ trái đi tiếp ${m} m`,
      });
    } else {
      steps.push({
        index: steps.length + 1,
        kind: 'right',
        distanceM: m,
        instruction: `Rẽ phải đi tiếp ${m} m`,
      });
    }

    prevUx = s.ux;
    prevUy = s.uy;
    emittedFirstWalk = true;
  }

  if (!emittedFirstWalk && segs.length > 0) {
    const totalWalk = segs.reduce((a, x) => a + x.len, 0);
    const m = fmtMeters(totalWalk);
    steps.push({
      index: steps.length + 1,
      kind: 'straight',
      distanceM: m,
      instruction: `Đi thẳng ${m} m dọc hành lang`,
    });
  }

  // Relative side of destination unit door from the visitor's last corridor heading
  const dMag = Math.hypot(doorInward.x, doorInward.y) || 1;
  const dux = doorInward.x / dMag;
  const duy = doorInward.y / dMag;
  const arriveCross = prevUx * duy - prevUy * dux;

  let sideText = 'nằm ngay trước mặt';
  if (hasShortDoorTurnIn) {
    if (arriveCross < -0.3) sideText = 'nằm bên trái';
    else if (arriveCross > 0.3) sideText = 'nằm bên phải';
  } else {
    if (arriveCross < -0.45) sideText = 'nằm bên trái';
    else if (arriveCross > 0.45) sideText = 'nằm bên phải';
  }

  steps.push({
    index: steps.length + 1,
    kind: 'arrive',
    instruction: `Kho ${unitCode} ${sideText}`,
  });

  return steps;
}

/**
 * Computes the optimal corridor route from LỐI VÀO CHÍNH to `targetUnit`'s front door.
 */
export function findUnitWayfinding(targetUnit: any, allUnits: any[], bounds?: PlanBounds): WayfindingResult | null {
  if (!targetUnit?.shape) return null;
  const bb = bounds ?? computePlanBounds(allUnits);

  const entrance: Waypoint2D = { x: bb.x + bb.w / 2, y: bb.y + bb.h - 4 };
  const startInner: Waypoint2D = {
    x: bb.x + bb.w / 2,
    y: Math.max(bb.y + 8, bb.y + bb.h - 20),
  };

  const { threshold, approachCandidates } = unitDoorPoints(targetUnit);
  const obstacles = buildObstacles(allUnits, String(targetUnit.id));

  // Clamp candidate points inside building bounds and pick the cleanest corridor approach point
  const clampToBounds = (p: Waypoint2D): Waypoint2D => ({
    x: Math.min(bb.x + bb.w - 6, Math.max(bb.x + 6, p.x)),
    y: Math.min(bb.y + bb.h - 6, Math.max(bb.y + 6, p.y)),
  });

  let approach = clampToBounds(approachCandidates[0]);
  for (const cand of approachCandidates) {
    const c = clampToBounds(cand);
    if (!isBlocked(c.x, c.y, obstacles, bb, 5.5)) {
      approach = c;
      break;
    }
  }
  if (isBlocked(approach.x, approach.y, obstacles, bb, 2)) {
    for (const cand of approachCandidates) {
      const c = clampToBounds(cand);
      if (!isBlocked(c.x, c.y, obstacles, bb, 1.5)) {
        approach = c;
        break;
      }
    }
  }

  // Collect axis edges of units to place exact corridor centerlines on the grid
  const xEdges: Array<[number, number]> = [];
  const yEdges: Array<[number, number]> = [];
  for (const u of allUnits) {
    if (!u?.shape) continue;
    const s = u.shape;
    xEdges.push([s.x, s.x + s.w]);
    yEdges.push([s.y, s.y + s.h]);
  }

  const xs = buildAxisCoords(bb.x, bb.x + bb.w, 12, [startInner.x, approach.x], xEdges);
  const ys = buildAxisCoords(bb.y, bb.y + bb.h, 12, [startInner.y, approach.y], yEdges);

  const findNearestIdx = (arr: number[], target: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - target);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const startIdx: [number, number] = [findNearestIdx(xs, startInner.x), findNearestIdx(ys, startInner.y)];
  const goalIdx: [number, number] = [findNearestIdx(xs, approach.x), findNearestIdx(ys, approach.y)];

  // Multi-pass A*:
  // 1) 6px obstacle inflation, crisp orthogonal corridors
  // 2) 6px obstacle inflation, 8-way (if rotated walls require angled corridor)
  // 3) 2px obstacle inflation, orthogonal (tightly packed custom layouts)
  // 4) 0.5px obstacle inflation, 8-way
  const corePath =
    runAStar(xs, ys, startIdx, goalIdx, obstacles, bb, 6, false) ??
    runAStar(xs, ys, startIdx, goalIdx, obstacles, bb, 6, true) ??
    runAStar(xs, ys, startIdx, goalIdx, obstacles, bb, 2, false) ??
    runAStar(xs, ys, startIdx, goalIdx, obstacles, bb, 0.5, true) ?? [
      startInner,
      { x: approach.x, y: startInner.y },
      approach,
    ];

  const fullChain = simplifyWaypoints([entrance, startInner, ...corePath, threshold]);

  let distancePx = 0;
  for (let i = 0; i < fullChain.length - 1; i++) {
    distancePx += Math.hypot(fullChain[i + 1].x - fullChain[i].x, fullChain[i + 1].y - fullChain[i].y);
  }

  const distanceM = Math.max(1, Math.round((distancePx / PX_PER_METER) * 10) / 10);
  const durationSec = Math.max(5, Math.round(distanceM / WALK_SPEED_MPS));
  const durationLabel = formatWalkingDuration(durationSec);

  const doorInward = {
    x: threshold.x - approach.x,
    y: threshold.y - approach.y,
  };
  const steps = buildVietnameseSteps(fullChain, String(targetUnit.code), doorInward);

  return {
    waypoints: fullChain,
    distancePx,
    distanceM,
    durationSec,
    durationLabel,
    steps,
    entrance,
    destination: threshold,
  };
}
