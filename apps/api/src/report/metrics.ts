/**
 * Pure helpers behind every dashboard and report number. One definition of each metric lives here (or in ReportService, which feeds
 * these helpers), so the same figure can never be worked out two different ways on two screens.
 */

/** Facilities whose units count toward occupancy (a draft or an inactive facility has no rentable stock). */
export const STOCK_FACILITY_STATUSES = ['ACTIVE', 'TEMPORARILY_CLOSED'];
/** Units that cannot be rented out any more; everything else (also under maintenance, waiting inspection, reserved) is rentable stock. */
export const NON_RENTABLE_UNIT_STATUSES = ['OUT_OF_SERVICE', 'RETIRED'];
/** A unit is occupied when a customer holds it: renting, or overlocked because of debt. */
export const OCCUPIED_UNIT_STATUSES = ['OCCUPIED', 'OVERLOCKED'];
/** Contracts that are currently earning rent for their unit. */
export const LIVE_CONTRACT_STATUSES = ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'];

export interface OccCounts {
  total: number;
  byStatus: Record<string, number>;
  rentable: number;
  occupied: number;
  areaRentable: number;
  areaOccupied: number;
  potentialRent: number;
  actualRent: number;
  activeContracts: number;
}

export const emptyOcc = (): OccCounts => ({ total: 0, byStatus: {}, rentable: 0, occupied: 0, areaRentable: 0, areaOccupied: 0, potentialRent: 0, actualRent: 0, activeContracts: 0 });

export function sumOcc(list: OccCounts[]): OccCounts {
  const out = emptyOcc();
  for (const c of list) {
    out.total += c.total;
    out.rentable += c.rentable;
    out.occupied += c.occupied;
    out.areaRentable += c.areaRentable;
    out.areaOccupied += c.areaOccupied;
    out.potentialRent += c.potentialRent;
    out.actualRent += c.actualRent;
    out.activeContracts += c.activeContracts;
    for (const [k, v] of Object.entries(c.byStatus)) out.byStatus[k] = (out.byStatus[k] ?? 0) + v;
  }
  return out;
}

/** The three occupancy rates and the average rent, always from the same counts, so a total row equals the headline figure. */
export function occRates(c: Pick<OccCounts, 'rentable' | 'occupied' | 'areaRentable' | 'areaOccupied' | 'potentialRent' | 'actualRent' | 'activeContracts'>) {
  return {
    unitRate: c.rentable ? c.occupied / c.rentable : 0,
    areaRate: c.areaRentable ? c.areaOccupied / c.areaRentable : 0,
    economicRate: c.potentialRent ? c.actualRent / c.potentialRent : 0,
    avgRent: c.activeContracts ? c.actualRent / c.activeContracts : 0,
  };
}

export interface RevenueParts {
  billed: number;
  collected: number;
  recognized: number;
  refunded: number;
  /** The rent part of `recognized` (service days that fall inside the period). */
  rentRecognized: number;
}
export const emptyRevenue = (): RevenueParts => ({ billed: 0, collected: 0, recognized: 0, refunded: 0, rentRecognized: 0 });
export function sumRevenue(list: RevenueParts[]): RevenueParts {
  const out = emptyRevenue();
  for (const r of list) {
    out.billed += r.billed;
    out.collected += r.collected;
    out.recognized += r.recognized;
    out.refunded += r.refunded;
    out.rentRecognized += r.rentRecognized;
  }
  return out;
}

export interface AgingBuckets {
  current: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}
export const emptyAging = (): AgingBuckets => ({ current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });
export function sumAging(list: AgingBuckets[]): AgingBuckets {
  const out = emptyAging();
  for (const a of list) {
    out.current += a.current;
    out.d0_30 += a.d0_30;
    out.d31_60 += a.d31_60;
    out.d61_90 += a.d61_90;
    out.d90_plus += a.d90_plus;
  }
  return out;
}
/** Overdue share of everything still owed: always between 0 and 1, whatever was billed recently. */
export function agingTotals(b: AgingBuckets) {
  const overdue = b.d0_30 + b.d31_60 + b.d61_90 + b.d90_plus;
  const total = overdue + b.current;
  return { overdue, total, overdueRatio: total > 0 ? overdue / total : 0 };
}
/** Which aging bucket an invoice belongs to, by whole days past its due date. */
export function agingBucket(daysPastDue: number): keyof AgingBuckets {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd0_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

// ---------------------------------------------------------------- stored daily snapshots
const VN_OFFSET_MS = 7 * 3600 * 1000;
/** The calendar day (YYYY-MM-DD, Vietnam time) a stored date stands for. Dates exported from MySQL sit at 17:00 UTC of the day before. */
export const dayKey = (d: Date | string): string => new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export interface MetricRow {
  metric_date: Date | string;
  facility_id: bigint | number | string;
  unit_type_key?: bigint | number | string | null;
  units_total: number | string;
  units_unavailable: number | string;
  units_occupied: number | string;
  units_overlocked: number | string;
  area_total_m2: number | string;
  area_occupied_m2: number | string;
  potential_rent: number | string;
  actual_rent: number | string;
}

export interface Snapshot {
  day: string;
  rentable: number;
  occupied: number;
  areaRentable: number;
  areaOccupied: number;
  potentialRent: number;
  actualRent: number;
}

export function snapshotFromRow(r: MetricRow): Snapshot {
  return {
    day: dayKey(r.metric_date),
    rentable: Math.max(0, Number(r.units_total) - Number(r.units_unavailable)),
    occupied: Number(r.units_occupied) + Number(r.units_overlocked),
    areaRentable: Number(r.area_total_m2),
    areaOccupied: Number(r.area_occupied_m2),
    potentialRent: Number(r.potential_rent),
    actualRent: Number(r.actual_rent),
  };
}

/**
 * The facility-level snapshot of each (day, facility). Older data stored every unit-type row with key 0 as well, so when a day has
 * several key-0 rows for one facility the one covering the most units is the facility total.
 */
export function facilitySnapshots(rows: MetricRow[]): Map<string, Snapshot & { facility: string }> {
  const best = new Map<string, MetricRow>();
  for (const r of rows) {
    if (Number(r.unit_type_key ?? 0) !== 0) continue;
    const k = `${dayKey(r.metric_date)}|${String(r.facility_id)}`;
    const prev = best.get(k);
    if (!prev || Number(r.units_total) > Number(prev.units_total)) best.set(k, r);
  }
  const out = new Map<string, Snapshot & { facility: string }>();
  for (const [k, r] of best) out.set(k, { ...snapshotFromRow(r), facility: String(r.facility_id) });
  return out;
}

export function sumSnapshots(list: Snapshot[]) {
  const out = { rentable: 0, occupied: 0, areaRentable: 0, areaOccupied: 0, potentialRent: 0, actualRent: 0, activeContracts: 0 };
  for (const s of list) {
    out.rentable += s.rentable;
    out.occupied += s.occupied;
    out.areaRentable += s.areaRentable;
    out.areaOccupied += s.areaOccupied;
    out.potentialRent += s.potentialRent;
    out.actualRent += s.actualRent;
  }
  return out;
}

/** First instant of a calendar day (a date held as UTC midnight) in Vietnam time, for comparing with timestamp columns. */
export const localDayStart = (d: Date) => new Date(d.getTime() - VN_OFFSET_MS);
/** Instant the day after `d` begins in Vietnam time: use it as an exclusive upper bound. */
export const localDayEnd = (d: Date) => new Date(d.getTime() - VN_OFFSET_MS + 86400000);
/** A timestamp range covering the whole calendar days from `from` to `to`. */
export const localRange = (from: Date, to: Date) => ({ gte: localDayStart(from), lt: localDayEnd(to) });

/** Period label for a calendar day. */
export function bucketOf(day: string, groupBy: 'day' | 'month' | 'year') {
  return groupBy === 'day' ? day : groupBy === 'month' ? day.slice(0, 7) : day.slice(0, 4);
}

// ---------------------------------------------------------------- CSV
export type CsvColumn = { key: string; label: string; type?: 'money' | 'pct' | 'int' | 'date' | 'text' };

const decimalComma = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000).replace('.', ','));

/**
 * One CSV cell, written the way Excel in a Vietnamese regional setting reads it: numbers unquoted (money as whole đồng, rate as "4,3%"),
 * text quoted, and text that would run as a formula in a spreadsheet (starts with = + - @) defused with a leading apostrophe.
 */
export function csvCell(v: unknown, type?: CsvColumn['type']): string {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'pct') return Number.isFinite(Number(v)) ? `${decimalComma(Math.round(Number(v) * 1000) / 10)}%` : '';
  if (type === 'money') return Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : '';
  if (type === 'int') return Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : '';
  if (typeof v === 'number') return Number.isFinite(v) ? decimalComma(v) : '';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** UTF-8 with a byte-order mark and an explicit `sep=;` line, so Excel opens it with the right letters and columns whatever the regional list separator is. */
export function buildCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): Buffer {
  const lines = ['sep=;', columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(';'), ...rows.map((r) => columns.map((c) => csvCell(r[c.key], c.type)).join(';'))];
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

// ---------------------------------------------------------------- admin security period
export interface AdminPeriod {
  key: string;
  label: string;
  from: Date;
  /** Exclusive end. */
  to: Date;
  bucket: 'hour' | 'day';
}

const PRESETS: Record<string, { days: number; label: string }> = {
  '7d': { days: 7, label: '7 ngày gần nhất' },
  '30d': { days: 30, label: '30 ngày gần nhất' },
  '90d': { days: 90, label: '90 ngày gần nhất' },
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The time window chosen on the security overview: a preset ending now, or custom whole days. Throws an Error with a readable message when the range is not valid. */
export function resolveAdminPeriod(q: { range?: string; from?: string; to?: string }, now: Date, today: Date): AdminPeriod {
  const range = q.range ?? '24h';
  if (range === 'custom') {
    if (!q.from || !q.to || !DAY_RE.test(q.from) || !DAY_RE.test(q.to)) throw new Error('Hãy chọn đủ "Từ ngày" và "Đến ngày"');
    const a = new Date(`${q.from}T00:00:00.000Z`);
    const b = new Date(`${q.to}T00:00:00.000Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) throw new Error('Ngày không hợp lệ');
    if (b < a) throw new Error('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
    if ((b.getTime() - a.getTime()) / 86400000 > 365) throw new Error('Chỉ xem được tối đa 366 ngày mỗi lần');
    const from = localDayStart(a);
    const to = localDayEnd(b);
    const span = to.getTime() - from.getTime();
    const f = q.from.split('-').reverse().join('/');
    const t = q.to.split('-').reverse().join('/');
    return { key: 'custom', label: q.from === q.to ? `Ngày ${f}` : `Từ ${f} đến ${t}`, from, to, bucket: span <= 48 * 3600000 ? 'hour' : 'day' };
  }
  const preset = PRESETS[range];
  if (preset) return { key: range, label: preset.label, from: localDayStart(new Date(today.getTime() - (preset.days - 1) * 86400000)), to: now, bucket: 'day' };
  return { key: '24h', label: '24 giờ gần nhất', from: new Date(now.getTime() - 24 * 3600000), to: now, bucket: 'hour' };
}

/** The bucket a login belongs to, in Vietnam time. */
export function adminBucketKey(at: Date | string, bucket: 'hour' | 'day'): string {
  const local = new Date(new Date(at).getTime() + VN_OFFSET_MS).toISOString();
  return bucket === 'hour' ? local.slice(0, 13) : local.slice(0, 10);
}

/** One empty bar for every hour or day of the period, so quiet stretches show as zero instead of disappearing from the chart. */
export function emptyAdminSeries(p: AdminPeriod): { key: string; label: string; ok: number; fail: number }[] {
  const out: { key: string; label: string; ok: number; fail: number }[] = [];
  if (p.bucket === 'hour') {
    const multiDay = p.to.getTime() - p.from.getTime() > 24 * 3600000;
    for (let t = Math.floor(p.from.getTime() / 3600000) * 3600000; t < p.to.getTime(); t += 3600000) {
      const local = new Date(t + VN_OFFSET_MS).toISOString();
      out.push({ key: local.slice(0, 13), label: multiDay ? `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 13)}h` : `${local.slice(11, 13)}:00`, ok: 0, fail: 0 });
    }
    return out;
  }
  for (let t = p.from.getTime(); t < p.to.getTime(); t += 86400000) {
    const local = new Date(t + VN_OFFSET_MS).toISOString();
    out.push({ key: local.slice(0, 10), label: `${local.slice(8, 10)}/${local.slice(5, 7)}`, ok: 0, fail: 0 });
  }
  return out;
}
