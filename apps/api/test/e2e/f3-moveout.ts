import { Client, check, section, summary, inDays, idem, BASE } from './lib';

const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');

interface RollingFacilityPhotoBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingFacilityPhotoByScope(items: readonly RollingFacilityPhotoBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const MONTHLY_UNIFIED_PROMOTION_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
};
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
