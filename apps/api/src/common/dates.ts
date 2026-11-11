import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Business dates (start_date, due_date…) are DATE columns in the facility time zone (spec §7.2).
 * In JS they are represented as Date at 00:00 UTC of that calendar day ("date-only").
 */
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export function todayIn(tz: string, now: Date): Date {
  return dateOnly(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
}
export function dateOnly(s: string | Date): Date {
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new Error(`Invalid date ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
/** Add months with end-of-month clamp: Jan 31 + 1 month = Feb 28/29 (spec §7.2.3). */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}
/** Whole calendar months from `from` to `to` (both date-only), ignoring the day of month. */
export const monthsBetween = (from: Date, to: Date) => (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
/** Start dates of every billing period of [anchor, end): always anchored on the first date so "31st" never drifts to the 28th. */
export function billingPeriodStarts(anchor: Date, end: Date, stepMonths = 1): Date[] {
  const out: Date[] = [];
  for (let k = 0; ; k += stepMonths) {
    const s = addMonths(anchor, k);
    if (s >= end) break;
    out.push(s);
  }
  return out;
}
export const diffDays = (a: Date, b: Date) => Math.round((dateOnly(a).getTime() - dateOnly(b).getTime()) / 86400000);
export const daysInMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
/** Local wall time (e.g. 2026-11-07 09:00 in facility TZ) -> UTC instant. */
export function zonedToUtc(dateStr: string, time: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, tz);
}
export const fmtDate = (d: Date | null | undefined) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');
export const fmtDateTime = (d: Date, tz = DEFAULT_TZ) => formatInTimeZone(d, tz, 'HH:mm dd/MM/yyyy');
export const weekdayIn = (d: Date, tz: string) => Number(formatInTimeZone(d, tz, 'i')) % 7; // 0=Sun
export const timeIn = (d: Date, tz: string) => formatInTimeZone(d, tz, 'HH:mm');
