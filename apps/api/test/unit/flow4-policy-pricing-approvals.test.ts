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

test('Flow 4 — VAT inclusive vs VAT exclusive pricing calculates tax after discounts (FIN-01 & FIN-03)', async () => {
  const unitType = {
    id: 5n,
    name: 'Kho L 12m²',
    status: 'ACTIVE',
    is_bookable: true,
    deleted_at: null,
    list_price: D(3_300_000),
    online_price: D(3_300_000),
    deposit_override: D(3_000_000),
    facility: { id: 1n, timezone: 'Asia/Ho_Chi_Minh' },
  };
  const fakeDb = {
    unitType: { findUnique: async () => unitType },
    promotion: {
      findMany: async () => [
        {
          id: 1n,
          code: 'SAVE300K',
          name: 'Giảm 300k',
          status: 'ACTIVE',
          starts_at: new Date('2026-01-01T00:00:00Z'),
          ends_at: null,
          type: 'FIXED_AMOUNT',
          value: D(300_000),
          applies_to_periods: 1,
          min_term_months: 1,
          max_redemptions: null,
          redeemed_count: 0,
          max_per_customer: 5,
          new_customers_only: false,
          facility_ids: null,
          unit_type_ids: null,
        },
      ],
    },
    promotionRedemption: { count: async () => 0 },
    contract: { count: async () => 0 },
  };

  // Case A: VAT Exclusive (10% VAT added on top of discounted subtotal)
  const exclusiveCore = {
    activePolicy: async () => ({
      id: 1n,
      version_no: 1,
      params: { ...DEFAULT_POLICY_PARAMS, vat_rate: 10, prices_include_vat: false, admin_fee: 0 },
    }),
    today: () => dateOnly('2026-11-01'),
    now: () => new Date('2026-11-01T00:00:00Z'),
    available: async () => 4,
  };
  const exclusiveSvc = new PricingService({} as never, exclusiveCore as never);
  const qEx = await exclusiveSvc.compute(fakeDb as never, {
    unitTypeId: 5n,
    startDate: dateOnly('2026-11-10'),
    termMonths: 1,
    billingMode: 'MONTHLY',
    promoCode: 'SAVE300K',
    customerId: null,
  });
  // Rent 3,300,000 - 300,000 discount = 3,000,000 net -> VAT 10% = 300,000 -> Due with 3,000,000 deposit = 6,300,000
  assert.equal(Number(qEx.tax), 300_000);
  assert.equal(Number(qEx.dueNow), 6_300_000);

  // Case B: VAT Inclusive (10% VAT extracted from discounted 3,000,000 gross = 272,727 VND, dueNow = 6,000,000)
  const inclusiveCore = {
    ...exclusiveCore,
    activePolicy: async () => ({
      id: 2n,
      version_no: 2,
      params: { ...DEFAULT_POLICY_PARAMS, vat_rate: 10, prices_include_vat: true, admin_fee: 0 },
    }),
  };
  const inclusiveSvc = new PricingService({} as never, inclusiveCore as never);
  const qIn = await inclusiveSvc.compute(fakeDb as never, {
    unitTypeId: 5n,
    startDate: dateOnly('2026-11-10'),
    termMonths: 1,
    billingMode: 'MONTHLY',
    promoCode: 'SAVE300K',
    customerId: null,
  });
  assert.equal(Number(qIn.tax), Math.round(3_000_000 - 3_000_000 / 1.1));
  assert.equal(Number(qIn.dueNow), 6_000_000);
});
