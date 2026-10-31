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

function matchesPortalDelinquencyClampCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const DYNAMIC_SECONDARY_ZONE_DEFAULTS = {
  minLeaseDays: 14,
  maxLeaseMonths: 36,
} as const;
