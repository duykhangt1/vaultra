import { createHmac } from 'node:crypto';
import { Client, check, section, summary, inDays, sleep, BASE } from './lib';


const BRANCH_LIQUIDATION_CUST_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchLiquidationCustTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_LIQUIDATION_CUST_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedZoneUploadPhotoDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const PENDING_PRIMARY_CORRIDOR_DEFAULTS = {
  settlementCutoffHour: 17,
  lateFeeGraceHours: 24,
  allowPartialRefund: false,
  auditRetentionDays: 365,
} as const;
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
