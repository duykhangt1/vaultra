/** Shared floor-plan helpers (canvas is in pixels; default 1200 x 700, grid 20). */
export type Shape = { x: number; y: number; w: number; h: number; rotation: number };

/** Drawn size of a unit from its type's real dimensions (40 px per metre, never smaller than a readable 60 px, never larger than 200). */
export function unitSize(u: any): { w: number; h: number } {
  const t = u?.type ?? u?.unit_type ?? {};
  const wm = Number(t.width_m), dm = Number(t.depth_m);
  const clamp = (v: number) => Math.min(200, Math.max(60, Math.round(v / 10) * 10));
  if (Number.isFinite(wm) && Number.isFinite(dm) && wm > 0 && dm > 0) return { w: clamp(wm * 40), h: clamp(dm * 40) };
  return { w: 80, h: 70 };
}

/**
 * Lays units out in wrapped rows with a gap, each at its type's size. Rows start below everything already placed (`existing`),
 * so units without a position never land on top of units that have one.
 */
export function layoutUnits(units: any[], width: number, grid: number, existing: Record<string, Shape> = {}): Record<string, Shape> {
  const margin = 40, gap = 24, g = Math.max(1, grid || 20);
  const snap = (v: number) => Math.round(v / g) * g;
  const bottoms = Object.values(existing).map((s) => s.y + s.h);
  let y = bottoms.length ? snap(Math.max(...bottoms) + margin) : margin;
  let x = margin, rowH = 0;
  const out: Record<string, Shape> = {};
  const list = [...units].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  for (const u of list) {
    const { w, h } = unitSize(u);
    if (x + w > width - margin && x > margin) { x = margin; y = snap(y + rowH + gap); rowH = 0; }
    out[u.id] = { x: snap(x), y: snap(y), w, h, rotation: 0 };
    x += w + gap; rowH = Math.max(rowH, h);
  }
  return out;
}
