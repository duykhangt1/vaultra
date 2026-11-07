import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  DEFAULT_POLICY_PARAMS,
  recommendSize,
  RESERVATION_TRANSITIONS,
  termRate,
} from '@vaultra/shared';
import '../../src/common/prisma.service';
import { PricingService } from '../../src/domain/pricing.service';
import { D } from '../../src/common/util';
import { addMonths, dateOnly } from '../../src/common/dates';

const basePolicy = {
  ...DEFAULT_POLICY_PARAMS,
  vat_rate: 10,
  prices_include_vat: false,
  admin_fee: 100_000,
  reservation_payment_mode: 'DEPOSIT_AND_FIRST_PERIOD' as const,
};

const unitTypeFixture = {
  id: 10n,
  name: 'Kho Tiêu Chuẩn 6m²',
  status: 'ACTIVE',
  is_bookable: true,
  deleted_at: null,
  list_price: D(2_200_000),
  online_price: D(2_000_000),
  deposit_override: null,
  facility: { id: 1n, timezone: 'Asia/Ho_Chi_Minh' },
};

test('Flow 1 — Size Advisor recommends appropriate storage size and estimates total volume', () => {
  const smallLoad = recommendSize([{ code: 'box_medium', qty: 4 }]);
  assert.ok(smallLoad.volume > 0);
  assert.equal(smallLoad.category, 'LOCKER');

  const largeLoad = recommendSize([
    { code: 'sofa_3', qty: 2 },
    { code: 'bed_double', qty: 2 },
    { code: 'fridge', qty: 2 },
    { code: 'wardrobe', qty: 3 },
    { code: 'box_large', qty: 15 },
  ]);
  assert.ok(largeLoad.volume >= 14);
  assert.ok(['L', 'XL'].includes(largeLoad.category));
});

test('Flow 1 — PricingService.compute applies promo code, term discount, admin fee, VAT, and deposit rules', async () => {
  const fakeCore = {
    activePolicy: async () => ({ id: 1n, version_no: 2, params: basePolicy }),
    today: () => dateOnly('2026-11-01'),
    now: () => new Date('2026-11-01T08:00:00Z'),
    available: async () => 5,
  };
  const fakeDb = {
    unitType: { findUnique: async () => unitTypeFixture },
    promotion: {
      findMany: async () => [
        {
          id: 99n,
          code: 'WELCOME10',
          name: 'Giảm 10% kỳ đầu',
          status: 'ACTIVE',
          starts_at: new Date('2026-01-01T00:00:00Z'),
          ends_at: null,
          type: 'PERCENT',
          value: D(10),
          applies_to_periods: 1,
          min_term_months: 3,
          max_redemptions: 100,
          redeemed_count: 12,
          max_per_customer: 2,
          new_customers_only: false,
          facility_ids: null,
          unit_type_ids: null,
        },
      ],
    },
    promotionRedemption: { count: async () => 0 },
    contract: { count: async () => 0 },
  };

  const svc = new PricingService({} as never, fakeCore as never);
  const quote = await svc.compute(fakeDb as never, {
    unitTypeId: 10n,
    startDate: dateOnly('2026-11-10'),
    termMonths: 3,
    billingMode: 'MONTHLY',
    promoCode: 'WELCOME10',
    customerId: 1n,
  });

  // 3 months MONTHLY -> 5% term discount off 2,000,000 = 1,900,000/month
  assert.equal(Number(quote.monthly), 1_900_000);
  // Deposit is 1 month of online base price = 2,000,000
  assert.equal(Number(quote.deposit), 2_000_000);
  // Promo WELCOME10 takes 10% off 1,900,000 = 190,000
  assert.equal(Number(quote.discount), 190_000);
  // Taxable = (1,900,000 - 190,000) + 100,000 admin_fee = 1,810,000; VAT 10% = 181,000
  assert.equal(Number(quote.tax), 181_000);
  // Due now = 1,810,000 + 181,000 + 2,000,000 deposit = 3,991,000
  assert.equal(Number(quote.dueNow), 3_991_000);
  assert.deepEqual(quote.endDate, addMonths(dateOnly('2026-11-10'), 3));
});
