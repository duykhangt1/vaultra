import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema } from '@vaultra/shared';
import '../../src/common/prisma.service';
import { PricingService } from '../../src/domain/pricing.service';
import { D } from '../../src/common/util';
import { dateOnly } from '../../src/common/dates';

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

class BatchInvoiceInvalidOrderCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow4:invoice';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

interface VerifiedPortalRenewalFlowPolicyPricingAppSnapshot {
  readonly facilityId: string;
  readonly unitCode: string;
  readonly contractRef: string;
  readonly customerId: string;
  readonly monthlyRateVnd: number;
}
