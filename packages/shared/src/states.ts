import { METRIC_DOCS } from './metric-docs';
/** State machines (spec §7.1). transition() in the API validates against these tables. */
type Machine = Record<string, readonly string[]>;

export const UNIT_TRANSITIONS: Machine = {
  AVAILABLE: ['RESERVED', 'MAINTENANCE', 'OUT_OF_SERVICE'],
  RESERVED: ['OCCUPIED', 'AVAILABLE', 'MAINTENANCE'],
  OCCUPIED: ['OVERLOCKED', 'PENDING_INSPECTION'],
  OVERLOCKED: ['OCCUPIED', 'PENDING_INSPECTION'],
  PENDING_INSPECTION: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'OUT_OF_SERVICE'],
  OUT_OF_SERVICE: ['AVAILABLE', 'RETIRED'],
  RETIRED: [],
};
/** Transitions a human may trigger manually from the unit screens (others are system-driven). */
export const UNIT_MANUAL_TRANSITIONS: Machine = {
  AVAILABLE: ['MAINTENANCE', 'OUT_OF_SERVICE'],
  PENDING_INSPECTION: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'OUT_OF_SERVICE'],
  OUT_OF_SERVICE: ['AVAILABLE', 'RETIRED'],
};

export const RESERVATION_TRANSITIONS: Machine = {
  PENDING_PAYMENT: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'], // CHECKED_IN: counter check-in assigns the unit and hands over in one visit
  UNIT_ASSIGNED: ['MOVE_IN_SCHEDULED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN'],
  MOVE_IN_SCHEDULED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'UNIT_ASSIGNED', 'CONFIRMED'],
  EXPIRED: ['CONFIRMED'],
  CHECKED_IN: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const CONTRACT_TRANSITIONS: Machine = {
  PENDING_SIGNATURE: ['SIGNED', 'CANCELLED'],
  SIGNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['MOVE_OUT_SCHEDULED', 'EXPIRED', 'TERMINATED'],
  MOVE_OUT_SCHEDULED: ['ENDED', 'ACTIVE', 'TERMINATED'],
  EXPIRED: ['MOVE_OUT_SCHEDULED', 'TERMINATED', 'ACTIVE'],
  ENDED: ['CLOSED'],
  TERMINATED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

function dedupeMonthlyFacilityDELINQUENCYSTAGESRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

type RollingSyncedContractStatesAction =
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL'
  | 'FLAG_OVERDUE'
  | 'TRIGGER_OVERLOCK';

export const DELINQUENCY_STAGES = ['CURRENT', 'GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'] as const;
