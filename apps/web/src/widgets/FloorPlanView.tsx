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

/** Graceful WebGL error boundary so devices without WebGL fall back cleanly to the 2D blueprint. */
class Stage3DBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function Stage3DSkeleton({ dark }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        'grid h-[460px] w-full place-items-center sm:h-[540px]',
        dark ? 'bg-ink-950/90 text-steel-300' : 'bg-[#EAE3D5] text-steel-600',
      )}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Box className="size-8 animate-pulse text-brass-500" />
        <p className="text-sm font-semibold">Đang dựng mô hình kiến trúc 3D…</p>
      </div>
    </div>
  );
}

/** Ensures unplaced units get non-overlapping coordinates when a zone has no saved shapes yet. */
function normalizeZoneUnits(
  rawUnits: any[] | undefined,
  plan?: { width?: number; height?: number; grid_size?: number; published_at?: string | null } | null,
): any[] {
  const all = rawUnits ?? [];
  const withShapes = all.filter((u) => u?.shape);
  if (withShapes.length > 0) return withShapes;
  if (!all.length) return [];
  const w = plan?.width && plan.width >= 200 ? plan.width : 1200;
  const g = plan?.grid_size && plan.grid_size >= 5 ? plan.grid_size : 20;
  const extra = layoutUnits(all, w, g, {});
  return all.map((u) => (u.shape ? u : { ...u, shape: extra[u.id] })).filter((u) => u.shape);
}

/** Picks an engaging showcase unit on initial load (prefers an AVAILABLE unit with a visible corridor walk). */
function pickDefaultUnit(units: any[], preferredCode?: string): any | null {
  if (!units.length) return null;
  if (preferredCode) {
    const clean = preferredCode.trim().toLowerCase();
    const exact = units.find((u) => String(u.code).toLowerCase() === clean);
    if (exact) return exact;
    const suffix = units.find((u) => String(u.code).toLowerCase().endsWith(`-${clean}`) || String(u.code).toLowerCase().endsWith(clean));
    if (suffix) return suffix;
  }
  const avail = units.filter((u) => u.status === 'AVAILABLE');
  const pool = avail.length > 0 ? avail : units;
  // Pick a unit around ~35% into the sorted list so the walking path showcases corridor turns cleanly
  return pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.35))] ?? pool[0];
}

function StepIcon({ kind }: { kind: StepKind }) {
  const cls = 'size-3.5 shrink-0';
  if (kind === 'start') return <DoorOpen className={cls} />;
  if (kind === 'left') return <CornerUpLeft className={cls} />;
  if (kind === 'right') return <CornerUpRight className={cls} />;
  if (kind === 'arrive') return <MapPin className={cls} />;
  return <ArrowUp className={cls} />;
}

function StatusIcon({ s }: { s: string }) {
  const c = 'size-3';
  if (s === 'OCCUPIED') return <KeyRound className={c} />;
  if (s === 'OVERLOCKED') return <Lock className={c} />;
  if (s === 'MAINTENANCE') return <Wrench className={c} />;
  if (s === 'OUT_OF_SERVICE' || s === 'RETIRED') return <Ban className={c} />;
  if (s === 'PENDING_INSPECTION' || s === 'RESERVED') return <Clock className={c} />;
  return <DoorOpen className={c} />;
}

/** Shared 2D Architectural SVG Renderer with Live Animated Wayfinding Overlay. */
function Blueprint2DSvg({
  zoneName,
  units,
  bb,
  filter,
  query,
  selectedUnit,
  onSelectUnit,
  route,
  dark,
  showStaffTooltip,
}: {
  zoneName?: string;
  units: any[];
  bb: PlanBounds;
  filter: string;
  query: string;
  selectedUnit: any | null;
  onSelectUnit: (u: any, secondClick?: boolean) => void;
  route: WayfindingResult | null;
  dark?: boolean;
  showStaffTooltip?: boolean;
}) {
  const [hover, setHover] = useState<{ u: any; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const uid = React.useId().replace(/:/g, '');

  const pad2 = 28;
  const vb = `${bb.x - pad2} ${bb.y - pad2} ${bb.w + pad2 * 2} ${bb.h + pad2 * 2}`;
  const q = query.trim().toLowerCase();

  const routePathD = useMemo(() => {
    if (!route || route.waypoints.length < 2) return '';
    return route.waypoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [route]);

  return (
    <div
      ref={box}
      className={cn(
        'relative overflow-x-auto p-3 sm:p-5',
        dark ? 'bg-[#091422]' : 'bg-[#EFEAE0]',
      )}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={vb}
        className="mx-auto block w-full min-w-[700px] select-none"
        role="img"
        aria-label={`Sơ đồ ${zoneName ?? 'khu lưu trữ'}`}
      >
        <defs>
          <pattern id={`fp-tiles-${uid}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="#E4DDCF" strokeWidth="1" />
          </pattern>
          <pattern id={`fp-maint-stripe-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#7E22CE" strokeOpacity="0.34" strokeWidth="2.8" />
          </pattern>
          <pattern id={`fp-stripe-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#475569" strokeOpacity="0.36" strokeWidth="2.8" />
          </pattern>
          <pattern id={`fp-dots-${uid}`} width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2.2" cy="2.2" r="1.15" fill="#B45309" fillOpacity="0.38" />
          </pattern>
          <filter id={`fp-shadow-${uid}`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#0E1B2C" floodOpacity="0.28" />
          </filter>
          <filter id={`fp-soft-${uid}`} x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#0E1B2C" floodOpacity="0.14" />
          </filter>
        </defs>

        {/* Building: outer wall, brass trim, floor, tile grid */}
        <rect x={bb.x - 12} y={bb.y - 12} width={bb.w + 24} height={bb.h + 24} rx="18" fill="#0E1B2C" stroke="#C8963E" strokeWidth="2" />
        <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} rx="8" fill="#F8F5EE" />
        <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} rx="8" fill={`url(#fp-tiles-${uid})`} />

        {/* Entrance Portal (LỐI VÀO CHÍNH) */}
        <rect x={bb.x + bb.w / 2 - 58} y={bb.y + bb.h - 5} width="116" height="18" fill="#F8F5EE" />
        <rect x={bb.x + bb.w / 2 - 64} y={bb.y + bb.h - 10} width="8" height="20" rx="2" fill="#C8963E" />
        <rect x={bb.x + bb.w / 2 + 56} y={bb.y + bb.h - 10} width="8" height="20" rx="2" fill="#C8963E" />
        <g transform={`translate(${bb.x + bb.w / 2} ${bb.y + bb.h + 18})`}>
          <path d="M-7 2 L0 -6 L7 2" fill="none" stroke="#C8963E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <text y="14" textAnchor="middle" fontSize="10.5" fontWeight="800" letterSpacing="1.5" fill={dark ? '#DDB065' : '#96691F'}>
            LỐI VÀO CHÍNH
          </text>
        </g>

        <text x={bb.x + 14} y={bb.y + 20} fontSize="11" fontWeight="700" letterSpacing="2" fill="#96691F">
          {String(zoneName ?? '').toUpperCase()}
        </text>

        {/* Units */}
        {units.map((u) => {
          const s = u.shape;
          const t = TONE[u.status] ?? TONE.AVAILABLE;
          const isSelected = Boolean(selectedUnit && String(selectedUnit.id) === String(u.id));
          const dim = !isSelected && ((filter && u.status !== filter) || (q && !String(u.code).toLowerCase().includes(q)));
          const active = isSelected || hover?.u.id === u.id;
          const cx = s.x + s.w / 2;
          const cy = s.y + s.h / 2;
          const dw = Math.min(s.w * 0.55, 34);
          const small = s.w < 62 || s.h < 62;
          const code = String(u.code).split('-').pop();
          const area = u.type?.area_m2 ?? u.unit_type?.area_m2;
          return (
            <g
              key={u.id}
              transform={`rotate(${s.rotation ?? 0} ${cx} ${cy})`}
              opacity={dim ? 0.24 : 1}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`Kho ${u.code}, ${STATUS.unit[u.status]?.[0] ?? u.status}`}
              onClick={() => onSelectUnit(u, isSelected)}
              onDoubleClick={() => onSelectUnit(u, true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectUnit(u, isSelected);
                }
              }}
              onMouseMove={(e) => {
                const r = box.current?.getBoundingClientRect();
                if (r) setHover({ u, x: e.clientX - r.left + (box.current?.scrollLeft ?? 0), y: e.clientY - r.top });
              }}
              onFocus={() => setHover({ u, x: 24, y: 24 })}
              onBlur={() => setHover(null)}
            >
              <g
                filter={active ? `url(#fp-shadow-${uid})` : `url(#fp-soft-${uid})`}
                style={{ transform: active ? 'translateY(-2px)' : undefined, transition: 'transform .15s' }}
              >
                {isSelected && (
                  <rect
                    x={s.x - 4}
                    y={s.y - 4}
                    width={s.w + 8}
                    height={s.h + 8}
                    rx="6"
                    fill="none"
                    stroke="#C8963E"
                    strokeWidth="3"
                    strokeOpacity="0.85"
                  />
                )}
                <rect
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  rx="3"
                  fill={isSelected ? '#0E1B2C' : t.fill}
                  stroke={isSelected ? '#F0B952' : t.stroke}
                  strokeWidth={active ? 3.2 : 2.2}
                />
                {!isSelected && u.status === 'MAINTENANCE' ? (
                  <rect x={s.x + 1} y={s.y + 1} width={s.w - 2} height={s.h - 2} rx="2" fill={`url(#fp-maint-stripe-${uid})`} />
                ) : !isSelected && (u.status === 'OUT_OF_SERVICE' || u.status === 'RETIRED') ? (
                  <rect x={s.x + 1} y={s.y + 1} width={s.w - 2} height={s.h - 2} rx="2" fill={`url(#fp-stripe-${uid})`} />
                ) : null}
                {!isSelected && u.status === 'OCCUPIED' ? (
                  <rect x={s.x + 1} y={s.y + 1} width={s.w - 2} height={s.h - 2} rx="2" fill={`url(#fp-dots-${uid})`} />
                ) : null}
                {/* Door opening + swing */}
                <rect x={cx - dw / 2} y={s.y + s.h - 2.6} width={dw} height="5.2" fill={isSelected ? '#F0B952' : '#F8F5EE'} />
                <line
                  x1={cx - dw / 2}
                  y1={s.y + s.h}
                  x2={cx - dw / 2}
                  y2={s.y + s.h - dw * 0.8}
                  stroke={isSelected ? '#F0B952' : t.stroke}
                  strokeWidth="1.6"
                />
                <path
                  d={`M ${cx - dw / 2} ${s.y + s.h - dw * 0.8} A ${dw * 0.8} ${dw * 0.8} 0 0 1 ${cx - dw / 2 + dw * 0.8} ${s.y + s.h}`}
                  fill="none"
                  stroke={isSelected ? '#F0B952' : t.stroke}
                  strokeWidth="1"
                  strokeDasharray="2.5 2.5"
                  strokeOpacity="0.85"
                />
              </g>
              <text
                x={cx}
                y={cy - (small ? 0 : 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={small ? 12.5 : 15}
                fontWeight="800"
                fill={isSelected ? '#FFFFFF' : t.ink}
              >
                {code}
              </text>
              {!small && area ? (
                <text
                  x={cx}
                  y={cy + 15}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={isSelected ? '#DDB065' : t.ink}
                  fillOpacity={isSelected ? 1 : 0.72}
                >
                  {Number(area)} m²
                </text>
              ) : null}
              {u.flag && u.flag !== 'NONE' ? (
                <g>
                  <circle cx={s.x + s.w - 7} cy={s.y + 7} r="5.5" fill="#B3362B" stroke="#fff" strokeWidth="1.5" />
                  <text x={s.x + s.w - 7} y={s.y + 10.3} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">
                    !
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {/* Animated 2D Wayfinding Corridor Route */}
        {route && routePathD && (
          <g pointerEvents="none">
            <path
              d={routePathD}
              fill="none"
              stroke="#DDB065"
              strokeWidth="11"
              strokeOpacity="0.32"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={routePathD}
              fill="none"
              stroke="#0E1B2C"
              strokeWidth="5.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={routePathD}
              fill="none"
              stroke="#F6C463"
              strokeWidth="2.8"
              strokeDasharray="8 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <animate attributeName="stroke-dashoffset" from="30" to="0" dur="0.9s" repeatCount="indefinite" />
            </path>
            {/* Start beacon at LỐI VÀO CHÍNH */}
            <circle cx={route.entrance.x} cy={route.entrance.y} r="6.5" fill="#0E1B2C" stroke="#F6C463" strokeWidth="2.5" />
            {/* Destination pin at unit doorway */}
            <circle cx={route.destination.x} cy={route.destination.y} r="6.5" fill="#F6C463" stroke="#0E1B2C" strokeWidth="2.2" />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-xl border hairline bg-white p-3 text-ink-900 shadow-pop"
          style={{
            left: Math.min(hover.x + 16, (box.current?.scrollWidth ?? 800) - 265),
            top: Math.max(hover.y - 8, 8),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="code text-base font-extrabold text-ink-900">{hover.u.code}</p>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: (TONE[hover.u.status] ?? TONE.AVAILABLE).fill,
                color: (TONE[hover.u.status] ?? TONE.AVAILABLE).ink,
                border: `1.5px solid ${(TONE[hover.u.status] ?? TONE.AVAILABLE).stroke}`,
              }}
            >
              <StatusIcon s={hover.u.status} />
              {STATUS.unit[hover.u.status]?.[0] ?? hover.u.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-steel-600">{hover.u.type?.name ?? hover.u.unit_type?.name}</p>
          {showStaffTooltip && hover.u.contract ? (
            <p className="mt-2 border-t hairline pt-2 text-xs text-steel-600">
              Khách thuê:{' '}
              <b className="text-ink-900">
                {hover.u.contract.customer?.full_name ??
                  (typeof hover.u.contract.customer === 'string' ? hover.u.contract.customer : null) ??
                  hover.u.contract.customer_name ??
                  'Đang thuê'}
              </b>
            </p>
          ) : null}
          {showStaffTooltip && hover.u.flag && hover.u.flag !== 'NONE' ? (
            <p className="mt-1 text-xs font-semibold text-bad-600">Có cảnh báo: {hover.u.flag}</p>
          ) : null}
          <p className="mt-2 text-[11px] text-steel-400">
            {showStaffTooltip ? 'Bấm để dẫn đường · bấm lần 2 mở quản lý kho' : 'Bấm để xem lộ trình đi bộ tới cửa kho'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. INTERNAL STAFF / OPS FLOOR PLAN (`FloorPlan`)
   ═══════════════════════════════════════════════════════════════════════════ */

export function FloorPlan({ facilityId, onPick }: { facilityId: string; onPick?: (u: any) => void }) {
  const fac = useGet<any>(`/facilities/${facilityId}`);
  const [zoneId, setZone] = useState('');
  const zones: any[] = fac.data?.zones ?? [];
  const zid = zoneId || zones[0]?.id;
  const fp = useGet<any>(zid ? `/zones/${zid}/floor-plan` : null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'3d' | '2d'>('3d');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={zid ?? ''} onChange={setZone} tabs={zones.map((z) => ({ value: z.id, label: z.name }))} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Chế độ hiển thị sơ đồ" className="inline-flex rounded-lg border border-steel-300 bg-white p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={mode === '3d'}
              onClick={() => setMode('3d')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                mode === '3d' ? 'bg-ink-900 text-white shadow-sm' : 'text-steel-600 hover:text-ink-900',
              )}
            >
              <Box className="size-3.5 text-brass-400" />
              3D Kiến trúc
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === '2d'}
              onClick={() => setMode('2d')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                mode === '2d' ? 'bg-ink-900 text-white shadow-sm' : 'text-steel-600 hover:text-ink-900',
              )}
            >
              <MapIcon className="size-3.5" />
              2D Bản vẽ
            </button>
          </div>

          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã kho…"
              aria-label="Tìm mã kho"
              className="h-10 w-48 rounded-lg border border-steel-300 bg-white pl-9 pr-7 text-sm outline-none focus:border-ink-900"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Xóa tìm kiếm"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-steel-400 hover:text-ink-900"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
        </div>
      </div>

      <Async q={fp}>
        {(d) => (
          <StaffPlanStage
            d={d}
            mode={mode}
            setMode={setMode}
            filter={filter}
            setFilter={setFilter}
            query={query}
            onPick={onPick}
          />
        )}
      </Async>
    </div>
  );
}

function StaffPlanStage({
  d,
  mode,
  setMode,
  filter,
  setFilter,
  query,
  onPick,
}: {
  d: any;
  mode: '3d' | '2d';
  setMode: (m: '3d' | '2d') => void;
  filter: string;
  setFilter: (s: string) => void;
  query: string;
  onPick?: (u: any) => void;
}) {
  const units = useMemo(() => normalizeZoneUnits(d.units, d.plan), [d.units, d.plan]);
  const bb = useMemo(() => computePlanBounds(units, d.plan), [units, d.plan]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select default unit per zone, or live-match when staff searches a unit code
  useEffect(() => {
    if (!units.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !units.some((u) => String(u.id) === String(selectedId))) {
      const def = pickDefaultUnit(units);
      setSelectedId(def ? String(def.id) : null);
    }
  }, [d.zone?.id, units]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match =
      units.find((u) => String(u.code).toLowerCase() === q) ??
      units.find((u) => String(u.code).toLowerCase().endsWith(`-${q}`)) ??
      units.find((u) => String(u.code).toLowerCase().includes(q));
    if (match) setSelectedId(String(match.id));
  }, [query, units]);

  const selectedUnit = useMemo(
    () => units.find((u) => String(u.id) === String(selectedId)) ?? null,
    [units, selectedId],
  );

  const route = useMemo(
    () => (selectedUnit ? findUnitWayfinding(selectedUnit, units, bb) : null),
    [selectedUnit, units, bb],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of d.units ?? []) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [d.units]);

  const total = (d.units ?? []).length;
  const rentable = total - (counts.OUT_OF_SERVICE ?? 0) - (counts.RETIRED ?? 0);
  const occupancy = rentable ? Math.round((((counts.OCCUPIED ?? 0) + (counts.OVERLOCKED ?? 0)) / rentable) * 100) : 0;

  const handleSelectUnit = (u: any, secondClick?: boolean) => {
    setSelectedId(String(u.id));
    if (secondClick && onPick) onPick(u);
  };

  const customerName =
    selectedUnit?.contract?.customer?.full_name ??
    (typeof selectedUnit?.contract?.customer === 'string' ? selectedUnit.contract.customer : null) ??
    selectedUnit?.contract?.customer_name;

  return (
    <Card className="overflow-hidden p-0">
      {/* Summary & status filter strip */}
      <div className="flex flex-wrap items-center gap-2 border-b hairline bg-paper/60 px-4 py-3">
        <div className="mr-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brass-700">{d.zone?.name}</p>
          <p className="text-sm text-steel-600">
            <b className="text-ink-900">{total}</b> kho · lấp đầy <b className="text-ink-900">{occupancy}%</b>{' '}
            <span
              className="text-steel-400"
              title="Lấp đầy chỉ tính kho đang thuê (đã nhận kho). Kho đã giữ là khách đã đặt, chưa check-in."
            >
              · đã giữ {rentable ? Math.round(((counts.RESERVED ?? 0) / rentable) * 100) : 0}%
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilter('')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition',
            !filter ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white text-steel-600 hover:border-ink-900',
          )}
        >
          Tất cả {total}
        </button>
        {ORDER.filter((s) => counts[s]).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setFilter(filter === s ? '' : s)}
            aria-pressed={filter === s}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition',
              filter === s
                ? 'border-ink-950 bg-ink-950/5 text-ink-950 ring-2 ring-ink-900/15 shadow-xs'
                : 'border-steel-300 bg-white text-ink-800 hover:border-ink-900',
            )}
          >
            <i className="size-3.5 rounded-[4px] border-2 shadow-2xs" style={{ background: TONE[s].fill, borderColor: TONE[s].stroke }} />
            {STATUS.unit[s]?.[0] ?? TONE[s].label} <span className="font-bold text-steel-500 num">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* 3D Architectural Maquette OR 2D SVG Blueprint */}
      {mode === '3d' ? (
        <Stage3DBoundary
          fallback={
            <Blueprint2DSvg
              zoneName={d.zone?.name}
              units={units}
              bb={bb}
              filter={filter}
              query={query}
              selectedUnit={selectedUnit}
              onSelectUnit={handleSelectUnit}
              route={route}
              showStaffTooltip
            />
          }
        >
          <Suspense fallback={<Stage3DSkeleton />}>
            <FloorPlan3D
              zoneName={d.zone?.name}
              floorNumber={d.zone?.floor ?? d.zone?.floor_number}
              units={units}
              bb={bb}
              selectedUnit={selectedUnit}
              onSelectUnit={handleSelectUnit}
              route={route}
              filterStatus={filter}
              searchQuery={query}
              onPrimaryAction={onPick}
              primaryActionLabel={onPick ? 'Quản lý kho →' : undefined}
            />
          </Suspense>
        </Stage3DBoundary>
      ) : (
        <Blueprint2DSvg
          zoneName={d.zone?.name}
          units={units}
          bb={bb}
          filter={filter}
          query={query}
          selectedUnit={selectedUnit}
          onSelectUnit={handleSelectUnit}
          route={route}
          showStaffTooltip
        />
      )}

      {/* Selected Unit Staff Inspector + Vietnamese Turn-by-Turn Wayfinding Bar */}
      {selectedUnit && (
        <div className="border-t hairline bg-paper/75 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 py-1 font-mono text-sm font-bold text-brass-400">
                <Navigation className="size-3.5" />
                Kho {selectedUnit.code}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  background: (TONE[selectedUnit.status] ?? TONE.AVAILABLE).fill,
                  color: (TONE[selectedUnit.status] ?? TONE.AVAILABLE).ink,
                  border: `1.5px solid ${(TONE[selectedUnit.status] ?? TONE.AVAILABLE).stroke}`,
                }}
              >
                <StatusIcon s={selectedUnit.status} />
                {STATUS.unit[selectedUnit.status]?.[0] ?? selectedUnit.status}
              </span>
              <span className="text-sm font-medium text-ink-800">
                {selectedUnit.type?.name ?? selectedUnit.unit_type?.name}
              </span>
              {customerName && (
                <span className="rounded-full border border-brass-500/40 bg-brass-100/70 px-2.5 py-0.5 text-xs font-semibold text-ink-900">
                  Khách thuê: {customerName}
                </span>
              )}
              {selectedUnit.flag && selectedUnit.flag !== 'NONE' && (
                <span className="rounded-full bg-bad-100 px-2.5 py-0.5 text-xs font-bold text-bad-600">
                  Cảnh báo: {selectedUnit.flag}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {route && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 num">
                  <Footprints className="size-3.5 text-brass-600" />
                  {route.distanceM} m · {route.durationLabel}
                </span>
              )}
              {onPick && (
                <Button size="sm" variant="primary" onClick={() => onPick(selectedUnit)}>
                  Chi tiết &amp; Quản lý kho
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          {route && (
            <ol className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
              {route.steps.map((st, idx) => (
                <li key={st.index} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium',
                      st.kind === 'arrive'
                        ? 'border-brass-500/50 bg-brass-100 text-ink-950 font-semibold'
                        : 'border-steel-200 bg-white text-ink-800',
                    )}
                  >
                    <span className="text-brass-700">
                      <StepIcon kind={st.kind} />
                    </span>
                    {st.instruction}
                  </span>
                  {idx < route.steps.length - 1 && <span className="text-steel-400">→</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t hairline px-4 py-3 text-xs text-steel-600">
        {ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className="size-3.5 rounded-[3px] border-2" style={{ background: TONE[s].fill, borderColor: TONE[s].stroke }} />
            {STATUS.unit[s]?.[0] ?? TONE[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i className="grid size-3.5 place-items-center rounded-full bg-bad-600 text-[8px] font-extrabold text-white">!</i>
          Có cảnh báo
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-steel-400">
          {mode === '3d' ? (
            <>
              <Navigation className="size-3.5 text-brass-600" />
              Đường vàng 3D = lộ trình đi bộ từ Lối vào chính
            </>
          ) : (
            <>
              <DoorOpen className="size-3.5" />
              Cung tròn nét đứt = hướng mở cửa
            </>
          )}
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. PUBLIC & CUSTOMER 3D FLOOR PLAN + WAYFINDING EXPLORER
   ═══════════════════════════════════════════════════════════════════════════ */

export function PublicFloorPlanExplorer({
  facilitySlug,
  initialUnitCode,
  dark = false,
  className,
}: PublicFloorPlanExplorerProps) {
  // Fetch public facilities list only when no explicit facilitySlug was passed (e.g. Homepage showcase)
  const facListQuery = useGet<{ data: any[] }>('/catalog/facilities', undefined, {
    enabled: !facilitySlug,
    staleTime: 60_000,
  });

  const facilities = facListQuery.data?.data ?? [];
  const [pickedSlug, setPickedSlug] = useState<string>('');
  const activeSlug = facilitySlug || pickedSlug || facilities[0]?.slug || '';

  const fpQuery = useGet<any>(activeSlug ? `/catalog/facilities/${activeSlug}/floor-plans` : null, undefined, {
    enabled: Boolean(activeSlug),
    staleTime: 30_000,
  });

  const [zoneId, setZoneId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const initializedKeyRef = useRef<string>('');

  const zonesData: any[] = fpQuery.data?.zones ?? [];

  // Normalize units per zone once so cross-zone search & auto-selection work seamlessly
  const normalizedZones = useMemo(
    () =>
      zonesData.map((z) => ({
        ...z,
        placedUnits: normalizeZoneUnits(z.units, z.plan),
      })),
    [zonesData],
  );

  // Auto-select initialUnitCode (switching to its zone automatically!) or a showcase AVAILABLE unit
  const loadedFacilityId = fpQuery.data?.facility?.id ?? fpQuery.data?.facility?.slug ?? '';
  useEffect(() => {
    if (!loadedFacilityId || !normalizedZones.length) return;
    const initKey = `${loadedFacilityId}|${initialUnitCode ?? ''}`;
    if (initializedKeyRef.current === initKey) return;
    initializedKeyRef.current = initKey;

    if (initialUnitCode) {
      const clean = initialUnitCode.trim().toLowerCase();
      for (const z of normalizedZones) {
        const hit =
          z.placedUnits.find((u: any) => String(u.code).toLowerCase() === clean) ??
          z.placedUnits.find((u: any) => String(u.code).toLowerCase().endsWith(`-${clean}`));
        if (hit) {
          setZoneId(String(z.zone.id));
          setSelectedUnitId(String(hit.id));
          return;
        }
      }
    }

    const firstZone = normalizedZones.find((z) => z.placedUnits.length > 0) ?? normalizedZones[0];
    setZoneId(String(firstZone.zone.id));
    const defUnit = pickDefaultUnit(firstZone.placedUnits);
    setSelectedUnitId(defUnit ? String(defUnit.id) : '');
  }, [loadedFacilityId, initialUnitCode, normalizedZones]);

  const currentZone = useMemo(
    () => normalizedZones.find((z) => String(z.zone.id) === String(zoneId)) ?? normalizedZones[0] ?? null,
    [normalizedZones, zoneId],
  );

  const units: any[] = currentZone?.placedUnits ?? [];
  const bb = useMemo(() => computePlanBounds(units, currentZone?.plan), [units, currentZone?.plan]);

  // Keep a valid selected unit when switching zones manually
  useEffect(() => {
    if (!units.length) {
      setSelectedUnitId('');
      return;
    }
    if (!selectedUnitId || !units.some((u) => String(u.id) === String(selectedUnitId))) {
      const def = pickDefaultUnit(units, initialUnitCode);
      setSelectedUnitId(def ? String(def.id) : '');
    }
  }, [currentZone?.zone?.id, units]);

  // Live unit code search -> auto-highlight & route to matching unit in current zone
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const hit =
      units.find((u) => String(u.code).toLowerCase() === q) ??
      units.find((u) => String(u.code).toLowerCase().endsWith(`-${q}`)) ??
      units.find((u) => String(u.code).toLowerCase().includes(q));
    if (hit) setSelectedUnitId(String(hit.id));
  }, [searchQuery, units]);

  // Cross-zone match helper if visitor searches a unit code located in another zone of the same facility
  const crossZoneHit = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const inCurrent = units.some((u) => String(u.code).toLowerCase().includes(q));
    if (inCurrent) return null;
    for (const z of normalizedZones) {
      if (String(z.zone.id) === String(currentZone?.zone?.id)) continue;
      const u =
        z.placedUnits.find((x: any) => String(x.code).toLowerCase() === q) ??
        z.placedUnits.find((x: any) => String(x.code).toLowerCase().includes(q));
      if (u) return { zone: z.zone, unit: u };
    }
    return null;
  }, [searchQuery, units, normalizedZones, currentZone]);

  const selectedUnit = useMemo(
    () => units.find((u) => String(u.id) === String(selectedUnitId)) ?? null,
    [units, selectedUnitId],
  );

  const route = useMemo(
    () => (selectedUnit ? findUnitWayfinding(selectedUnit, units, bb) : null),
    [selectedUnit, units, bb],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [units]);

  if (!facilitySlug && facListQuery.isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className={cn('h-12 w-2/3', dark && 'bg-white/10')} />
        <Skeleton className={cn('h-[520px] w-full rounded-2xl', dark && 'bg-white/10')} />
      </div>
    );
  }

  if (fpQuery.error) {
    return (
      <div className={cn('rounded-2xl border p-6', dark ? 'border-white/15 bg-ink-950/70 text-white' : 'border hairline bg-white', className)}>
        <ErrorState error={fpQuery.error} onRetry={fpQuery.refetch} />
      </div>
    );
  }

  const isLoading = fpQuery.isLoading || !fpQuery.data;
  const facilityInfo = fpQuery.data?.facility;
  const unitType = selectedUnit?.type ?? selectedUnit?.unit_type ?? null;
  const isMyRentedUnit =
    Boolean(initialUnitCode && selectedUnit) &&
    String(selectedUnit.code).toLowerCase() === initialUnitCode!.trim().toLowerCase();

  return (
    <div className={cn(className)}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl border transition',
          dark
            ? 'border-white/12 bg-[#08111e]/90 text-white shadow-[0_24px_64px_-20px_rgb(0_0_0/0.6)]'
            : 'border hairline bg-white text-ink-900 shadow-[var(--shadow-card)]',
        )}
      >
        {/* Single Compact Control Header */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5',
            dark ? 'border-white/10 bg-white/[0.025]' : 'hairline bg-paper/60',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            {/* Facility Tabs (Homepage only) */}
            {!facilitySlug && facilities.length > 0 && (
              <div
                className={cn(
                  'inline-flex flex-wrap items-center gap-1 rounded-xl border p-1',
                  dark ? 'border-white/10 bg-black/25' : 'border-steel-200 bg-white',
                )}
              >
                {facilities.map((f: any) => {
                  const active = f.slug === activeSlug;
                  return (
                    <button
                      key={f.id ?? f.slug}
                      type="button"
                      onClick={() => {
                        setPickedSlug(f.slug);
                        setSearchQuery('');
                        setFilterStatus('');
                      }}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                        dark
                          ? active
                            ? 'bg-brass-500 text-ink-950 shadow-xs'
                            : 'text-steel-300 hover:text-white'
                          : active
                            ? 'bg-ink-900 text-white shadow-xs'
                            : 'text-steel-600 hover:text-ink-900',
                      )}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            )}

            {!facilitySlug && facilities.length > 0 && normalizedZones.length > 1 && (
              <span aria-hidden className={cn('hidden h-5 w-px sm:block', dark ? 'bg-white/12' : 'bg-steel-200')} />
            )}

            {/* Zone Tabs */}
            {isLoading ? (
              <Skeleton className={cn('h-8 w-44', dark && 'bg-white/10')} />
            ) : (
              normalizedZones.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {normalizedZones.map((z) => {
                    const active = String(z.zone.id) === String(currentZone?.zone?.id);
                    return (
                      <button
                        key={z.zone.id}
                        type="button"
                        onClick={() => setZoneId(String(z.zone.id))}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                          dark
                            ? active
                              ? 'bg-white/14 text-white'
                              : 'text-steel-400 hover:bg-white/6 hover:text-white'
                            : active
                              ? 'border border-ink-900 bg-paper text-ink-950 font-bold'
                              : 'text-steel-600 hover:bg-paper hover:text-ink-900',
                        )}
                      >
                        {z.zone.name}
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Search + 3D/2D Switch */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
            <label className="relative flex-1 sm:w-48 sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-steel-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã kho..."
                aria-label="Tìm mã kho"
                className={cn(
                  'h-8 w-full rounded-lg border pl-8 pr-7 text-xs font-medium outline-none transition',
                  dark
                    ? 'border-white/12 bg-white/6 text-white placeholder:text-steel-400 focus:border-brass-400'
                    : 'border-steel-300 bg-white text-ink-900 placeholder:text-steel-400 focus:border-ink-900',
                )}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa mã tìm kiếm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 hover:text-brass-400"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>

            <div
              role="tablist"
              aria-label="Chế độ xem 3D hoặc 2D"
              className={cn(
                'inline-flex rounded-lg border p-0.5',
                dark ? 'border-white/12 bg-white/6' : 'border-steel-300 bg-white',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === '3d'}
                onClick={() => setMode('3d')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition',
                  mode === '3d'
                    ? dark
                      ? 'bg-brass-500 text-ink-950'
                      : 'bg-ink-900 text-white'
                    : dark
                      ? 'text-steel-300 hover:text-white'
                      : 'text-steel-600 hover:text-ink-900',
                )}
              >
                <Box className="size-3.5" />
                3D
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === '2d'}
                onClick={() => setMode('2d')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition',
                  mode === '2d'
                    ? dark
                      ? 'bg-brass-500 text-ink-950'
                      : 'bg-ink-900 text-white'
                    : dark
                      ? 'text-steel-300 hover:text-white'
                      : 'text-steel-600 hover:text-ink-900',
                )}
              >
                <MapIcon className="size-3.5" />
                2D
              </button>
            </div>
          </div>
        </div>

        {/* Cross-Zone Search Jump Banner */}
        {crossZoneHit && (
          <div
            className={cn(
              'flex items-center justify-between gap-3 border-b px-4 py-2 text-xs',
              dark ? 'border-brass-400/30 bg-brass-500/15 text-brass-300' : 'border-brass-500/30 bg-brass-100 text-ink-900',
            )}
          >
            <span>
              Kho <b>{crossZoneHit.unit.code}</b> nằm ở <b>{crossZoneHit.zone.name}</b>.
            </span>
            <button
              type="button"
              onClick={() => {
                setZoneId(String(crossZoneHit.zone.id));
                setSelectedUnitId(String(crossZoneHit.unit.id));
              }}
              className="inline-flex items-center gap-1 rounded-full bg-brass-500 px-3 py-1 font-semibold text-ink-950 hover:bg-brass-400"
            >
              Xem {crossZoneHit.zone.name}
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        )}

        {/* Main Stage + Right Unit & Wayfinding Panel */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={cn('min-w-0', dark ? 'lg:border-r lg:border-white/10' : 'lg:border-r hairline')}>
            {isLoading ? (
              <Stage3DSkeleton dark={dark} />
            ) : mode === '3d' ? (
              <Stage3DBoundary
                fallback={
                  <Blueprint2DSvg
                    zoneName={currentZone?.zone?.name}
                    units={units}
                    bb={bb}
                    filter={filterStatus}
                    query={searchQuery}
                    selectedUnit={selectedUnit}
                    onSelectUnit={(u) => setSelectedUnitId(String(u.id))}
                    route={route}
                    dark={dark}
                  />
                }
              >
                <Suspense fallback={<Stage3DSkeleton dark={dark} />}>
                  <FloorPlan3D
                    zoneName={currentZone?.zone?.name}
                    floorNumber={currentZone?.zone?.floor_number}
                    units={units}
                    bb={bb}
                    selectedUnit={selectedUnit}
                    onSelectUnit={(u) => setSelectedUnitId(String(u.id))}
                    route={route}
                    filterStatus={filterStatus}
                    searchQuery={searchQuery}
                    dark={dark}
                  />
                </Suspense>
              </Stage3DBoundary>
            ) : (
              <Blueprint2DSvg
                zoneName={currentZone?.zone?.name}
                units={units}
                bb={bb}
                filter={filterStatus}
                query={searchQuery}
                selectedUnit={selectedUnit}
                onSelectUnit={(u) => setSelectedUnitId(String(u.id))}
                route={route}
                dark={dark}
              />
            )}

            {/* Minimal Legend */}
            <div
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs',
                dark ? 'border-white/10 bg-ink-950/50 text-steel-300' : 'hairline bg-paper/50 text-steel-600',
              )}
            >
              {(['AVAILABLE', 'OCCUPIED', 'RESERVED'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 font-medium">
                  <i className="size-3.5 rounded-[4px] border-2" style={{ background: TONE[s].fill, borderColor: TONE[s].stroke }} />
                  {STATUS.unit[s]?.[0] ?? TONE[s].label}
                </span>
              ))}
              {counts.MAINTENANCE > 0 && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <i className="size-3.5 rounded-[4px] border-2" style={{ background: TONE.MAINTENANCE.fill, borderColor: TONE.MAINTENANCE.stroke }} />
                  {STATUS.unit.MAINTENANCE?.[0] ?? TONE.MAINTENANCE.label}
                </span>
              )}
              <span className={cn('ml-auto font-mono text-[11px] num', dark ? 'text-steel-400' : 'text-steel-500')}>
                {counts.AVAILABLE ?? 0}/{units.length} kho trống
              </span>
            </div>
          </div>

          {/* Right Panel: Selected Unit + Walking Steps */}
          <aside className={cn('flex flex-col justify-between p-4 sm:p-5', dark ? 'bg-white/[0.015]' : 'bg-paper/30')}>
            {selectedUnit ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-xs', dark ? 'text-steel-400' : 'text-steel-500')}>
                        {currentZone?.zone?.name}
                      </span>
                      {isMyRentedUnit && (
                        <Badge tone="brass" dot>
                          Kho của bạn
                        </Badge>
                      )}
                    </div>
                    <h3 className={cn('display mt-0.5 text-2xl font-bold', dark ? 'text-white' : 'text-ink-950')}>
                      Kho {selectedUnit.code}
                    </h3>
                  </div>

                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      background: (TONE[selectedUnit.status] ?? TONE.AVAILABLE).fill,
                      color: (TONE[selectedUnit.status] ?? TONE.AVAILABLE).ink,
                      border: `1.5px solid ${(TONE[selectedUnit.status] ?? TONE.AVAILABLE).stroke}`,
                    }}
                  >
                    <StatusIcon s={selectedUnit.status} />
                    {STATUS.unit[selectedUnit.status]?.[0] ?? selectedUnit.status}
                  </span>
                </div>

                {unitType && (
                  <div
                    className={cn(
                      'rounded-xl border p-3.5',
                      dark ? 'border-white/10 bg-white/[0.03]' : 'border-steel-200 bg-white',
                    )}
                  >
                    <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-ink-900')}>{unitType.name}</p>
                    <p className={cn('mt-1 font-mono text-xs num', dark ? 'text-steel-300' : 'text-steel-600')}>
                      {unitType.width_m} × {unitType.depth_m} × {unitType.height_m} m ·{' '}
                      <b className={dark ? 'text-white' : 'text-ink-900'}>{unitType.area_m2} m²</b>
                    </p>

                    {(unitType.climate_controlled || unitType.drive_up || unitType.ground_floor) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {unitType.climate_controlled && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]',
                              dark ? 'bg-white/8 text-steel-200' : 'bg-paper text-ink-800',
                            )}
                          >
                            <Thermometer className="size-3 text-brass-500" />
                            Điều hòa
                          </span>
                        )}
                        {unitType.drive_up && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]',
                              dark ? 'bg-white/8 text-steel-200' : 'bg-paper text-ink-800',
                            )}
                          >
                            <Truck className="size-3 text-brass-500" />
                            Xe vào tận cửa
                          </span>
                        )}
                        {unitType.ground_floor && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]',
                              dark ? 'bg-white/8 text-steel-200' : 'bg-paper text-ink-800',
                            )}
                          >
                            <Layers className="size-3 text-brass-500" />
                            Tầng trệt
                          </span>
                        )}
                      </div>
                    )}

                    {unitType.online_price > 0 && (
                      <div
                        className={cn(
                          'mt-3 flex items-baseline justify-between border-t pt-2.5',
                          dark ? 'border-white/10' : 'hairline',
                        )}
                      >
                        <span className={cn('text-xs', dark ? 'text-steel-400' : 'text-steel-500')}>Giá thuê</span>
                        <span className={cn('text-base font-bold num', dark ? 'text-brass-400' : 'text-ink-950')}>
                          {vnd(unitType.online_price)}
                          <span className={cn('text-xs font-normal', dark ? 'text-steel-400' : 'text-steel-500')}>/tháng</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {route && (
                  <div
                    className={cn(
                      'rounded-xl border p-3.5',
                      dark ? 'border-white/10 bg-white/[0.03]' : 'border-steel-200 bg-white',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('flex items-center gap-1.5 text-xs font-semibold', dark ? 'text-white' : 'text-ink-900')}>
                        <Footprints className="size-3.5 text-brass-500" />
                        Lối đi từ cổng chính
                      </p>
                      <span className={cn('shrink-0 whitespace-nowrap font-mono text-[11px] num', dark ? 'text-brass-400' : 'text-brass-700')}>
                        {route.distanceM} m · {route.durationLabel}
                      </span>
                    </div>

                    <ol className="mt-3 space-y-2">
                      {route.steps.map((st, idx) => {
                        const isLast = idx === route.steps.length - 1;
                        return (
                          <li key={st.index} className="flex items-start gap-2.5 text-xs">
                            <span
                              className={cn(
                                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px]',
                                isLast
                                  ? 'bg-brass-500 text-ink-950'
                                  : dark
                                    ? 'bg-white/10 text-steel-200'
                                    : 'bg-paper text-ink-800',
                              )}
                            >
                              <StepIcon kind={st.kind} />
                            </span>
                            <span
                              className={cn(
                                'leading-relaxed',
                                isLast
                                  ? dark
                                    ? 'font-semibold text-brass-300'
                                    : 'font-semibold text-ink-950'
                                  : dark
                                    ? 'text-steel-300'
                                    : 'text-steel-600',
                              )}
                            >
                              {st.instruction}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-steel-400">
                Chọn một ô kho trên sơ đồ để xem kích thước và lối đi.
              </div>
            )}

            {selectedUnit && (
              <div className="mt-4 pt-2">
                {selectedUnit.status === 'AVAILABLE' && unitType?.id ? (
                  <Link
                    to={`/book/${unitType.id}?facility=${encodeURIComponent(facilityInfo?.slug ?? activeSlug)}`}
                    className="block"
                  >
                    <Button variant="primary" className="w-full justify-center">
                      Đặt kho này
                      <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                ) : isMyRentedUnit ? (
                  <p className={cn('text-xs leading-relaxed', dark ? 'text-steel-300' : 'text-steel-600')}>
                    Nhập mã PIN tại cổng chính và đi theo vạch dẫn đường màu vàng tới kho {selectedUnit.code}.
                  </p>
                ) : counts.AVAILABLE > 0 ? (
                  <Button
                    variant={dark ? 'glass' : 'outline'}
                    className="w-full justify-center"
                    onClick={() => {
                      const nextAvail = units.find((u) => u.status === 'AVAILABLE');
                      if (nextAvail) {
                        setFilterStatus('');
                        setSelectedUnitId(String(nextAvail.id));
                      }
                    }}
                  >
                    Xem kho đang trống ({counts.AVAILABLE})
                  </Button>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
