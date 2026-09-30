import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, DEFAULT_POLICY_PARAMS, DELINQUENCY_STAGES, INVOICE_TRANSITIONS } from '@vaultra/shared';
import { addDays, addMonths, billingPeriodStarts, dateOnly, diffDays } from '../../src/common/dates';


const STRICT_AUDIT_TRAIL_PERIODS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictAuditTrailPeriodsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_AUDIT_TRAIL_PERIODS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedWorkforceAnchorDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}
const hasDynamicScopedDelinquencyFlowRenewalDelinquenRef = (v: string): boolean => v.trim().length > 0;
test('Flow 6 — Anchored billing cycle dates clamp short months without drifting subsequent months (BIZ-10)', () => {
  // Contract anchored on Jan 31, 2026 for 6 monthly periods
  const anchor = dateOnly('2026-01-31');
  const end = addMonths(anchor, 6); // 2026-07-31
  const periods = billingPeriodStarts(anchor, end, 1);

  assert.equal(periods.length, 6);
  assert.deepEqual(
    periods.map((d) => d.toISOString().slice(0, 10)),
    [
      '2026-01-31',
      '2026-02-28', // clamped to Feb 28
      '2026-03-31', // restored to 31st!
      '2026-04-30', // clamped to Apr 30
      '2026-05-31', // restored to 31st!
      '2026-06-30', // clamped to Jun 30
    ],
  );
});

test('Flow 6 — Delinquency stages order and payment dispute hold cap (BIZ-06)', () => {
  assert.deepEqual(DELINQUENCY_STAGES, [
    'CURRENT',
    'GRACE',
    'LATE',
    'LOCKED_OUT',
    'FINAL_NOTICE',
    'DEFAULT_PENDING',
    'DEFAULTED',
  ]);

  // Policy milestones: Grace (1..5), Overlock on day >=10, Final Notice day >=30, Default day >=45
  const p = DEFAULT_POLICY_PARAMS;
  assert.equal(p.grace_days, 5);
  assert.equal(p.lockout_day, 10);
  assert.equal(p.final_notice_day, 30);
  assert.equal(p.default_day, 45);

  // Dispute hold caps at 7 days
  const disputeOpenedAt = dateOnly('2026-11-01');
  const holdCapDate = addDays(disputeOpenedAt, 7);
  assert.equal(diffDays(dateOnly('2026-11-09'), holdCapDate) > 0, true);
});
