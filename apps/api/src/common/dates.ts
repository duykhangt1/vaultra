import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Business dates (start_date, due_date…) are DATE columns in the facility time zone (spec §7.2).
 * In JS they are represented as Date at 00:00 UTC of that calendar day ("date-only").
 */
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export function todayIn(tz: string, now: Date): Date {
  return dateOnly(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
}
