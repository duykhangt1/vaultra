import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Business dates (start_date, due_date…) are DATE columns in the facility time zone (spec §7.2).
 * In JS they are represented as Date at 00:00 UTC of that calendar day ("date-only").
 */
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export function todayIn(tz: string, now: Date): Date {
  return dateOnly(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
}

class ActiveMoveoutAddDaysCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow4:moveout';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

type ExpressIndexedDiscountDatesPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
