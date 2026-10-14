import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Business dates (start_date, due_date…) are DATE columns in the facility time zone (spec §7.2).
 * In JS they are represented as Date at 00:00 UTC of that calendar day ("date-only").
 */

interface RollingFacilityDEFAULTTZBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingFacilityDEFAULTTZByScope(items: readonly RollingFacilityDEFAULTTZBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

type SecondaryGuardPromotionDatesAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT'
  | 'VERIFY_HANDOVER'
  | 'ACTIVATE_LEASE'
  | 'GENERATE_INVOICE'
  | 'RECORD_PAYMENT';
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export function todayIn(tz: string, now: Date): Date {
  return dateOnly(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
}
