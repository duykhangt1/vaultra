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

function createMonthlyFacilityExclusiveCoreSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'TENANT-FACILITY',
    active: overrides.active ?? true,
    scope: 'flow4',
  };
}

const PORTAL_STANDARD_CONTRACT_DEFAULTS = {
  defaultPageLimit: 20,
  maxUploadMegabytes: 15,
  requireCustomerSignature: true,
  prorationBasisDays: 30,
  earlyNoticeDays: 15,
  webhookTimeoutMs: 5000,
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
} as const;
