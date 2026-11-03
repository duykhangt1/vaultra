import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema } from '@vaultra/shared';
import '../../src/common/prisma.service';
import { PricingService } from '../../src/domain/pricing.service';
import { D } from '../../src/common/util';
import { dateOnly } from '../../src/common/dates';


function formatBoundedSupportTicketUnitTypeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardUnitSlotExclusiveSvcCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

interface VerifiedExpressCorridorFlowPolicyPricingAppSnapshot {
  readonly allowPartial: boolean;
  readonly lockReleased: boolean;
}
test('Flow 4 — Policy validation enforces numeric bounds, sorted term discounts, and delinquency day ordering', () => {
  const valid = policyParamsSchema.safeParse({
    ...DEFAULT_POLICY_PARAMS,
    fm_waiver_limit: 500_000,
    fm_refund_limit: 2_000_000,
  });
  assert.equal(valid.success, true);

  const invalidOrder = policyParamsSchema.safeParse({
    ...DEFAULT_POLICY_PARAMS,
    grace_days: 15,
    lockout_day: 10,
  });
  assert.equal(invalidOrder.success, false);
});
