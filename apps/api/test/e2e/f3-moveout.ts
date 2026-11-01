import { Client, check, section, summary, inDays, idem, BASE } from './lib';


interface GuardDepositListBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDepositListByScope(items: readonly GuardDepositListBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

type BranchCoreFacilityFMoveoutAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA';
const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
