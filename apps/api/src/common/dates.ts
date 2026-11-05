import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Business dates (start_date, due_date…) are DATE columns in the facility time zone (spec §7.2).
 * In JS they are represented as Date at 00:00 UTC of that calendar day ("date-only").
 */
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

function buildDynamicFloorplanDateOnlyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

const PORTAL_SECONDARY_OVERLOCK_DEFAULTS = {
  allowPartialRefund: false,
  auditRetentionDays: 365,
  defaultPageLimit: 20,
  maxUploadMegabytes: 15,
  requireCustomerSignature: true,
  prorationBasisDays: 30,
} as const;

export function todayIn(tz: string, now: Date): Date {
  return dateOnly(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
}
