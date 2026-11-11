import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema, termRate } from '@vaultra/shared';

const P = DEFAULT_POLICY_PARAMS; // 1m 0%, 3m 5%, 6m 10%, 12m 15%, prepaid 3%

test('one month, pay monthly = list price', () => {
  assert.deepEqual(termRate(P, 1_000_000, 1, 'MONTHLY'), { monthly: 1_000_000, termPct: 0, prepaidPct: 0, listMonthly: 1_000_000 });
});

test('longer term takes its own percentage off the monthly rate', () => {
  assert.equal(termRate(P, 1_000_000, 3, 'MONTHLY').monthly, 950_000);
  assert.equal(termRate(P, 1_000_000, 6, 'MONTHLY').monthly, 900_000);
  assert.equal(termRate(P, 1_000_000, 12, 'MONTHLY').monthly, 850_000);
});

test('paying the whole term up front takes a further discount, compounded', () => {
  const r = termRate(P, 1_000_000, 12, 'PREPAID_TERM');
  assert.equal(r.termPct, 15);
  assert.equal(r.prepaidPct, 3);
  assert.equal(r.monthly, 824_500); // 1,000,000 x 0.85 x 0.97
  assert.ok(r.monthly < termRate(P, 1_000_000, 12, 'MONTHLY').monthly);
});

test('prepaying a single month earns nothing extra', () => {
  assert.equal(termRate(P, 1_000_000, 1, 'PREPAID_TERM').monthly, 1_000_000);
});

test('a term without an entry has no discount, and the rate is whole dong', () => {
  assert.equal(termRate({ ...P, term_discounts: [] }, 1_234_567, 6, 'MONTHLY').monthly, 1_234_567);
  assert.equal(Number.isInteger(termRate(P, 1_234_567, 3, 'PREPAID_TERM').monthly), true);
});

test('policy schema accepts the defaults and rejects duplicate or out-of-range discounts', () => {
  assert.equal(policyParamsSchema.safeParse(P).success, true);
  assert.equal(policyParamsSchema.safeParse({ ...P, term_discounts: [{ months: 3, pct: 5 }, { months: 3, pct: 8 }] }).success, false);
  assert.equal(policyParamsSchema.safeParse({ ...P, term_discounts: [{ months: 3, pct: 90 }] }).success, false);
  assert.equal(policyParamsSchema.safeParse({ ...P, prepaid_discount_pct: 50 }).success, false);
});

// ---- the quote the booking page gets: rent follows term + payment mode, deposit follows the list price
import '../../src/common/prisma.service';
import { PricingService } from '../../src/domain/pricing.service';
import { D } from '../../src/common/util';

const ut = { id: 1n, name: 'Kho 3m', status: 'ACTIVE', is_bookable: true, deleted_at: null, list_price: D(1_100_000), online_price: D(1_000_000), deposit_override: null, facility: { id: 1n, timezone: 'Asia/Ho_Chi_Minh' } };
const fakeCore = {
  activePolicy: async () => ({ id: 7n, version_no: 1, params: { ...P, vat_rate: 0, admin_fee: 0, reservation_payment_mode: 'DEPOSIT_AND_FIRST_PERIOD' as const } }),
  today: () => new Date('2026-11-11T00:00:00Z'), now: () => new Date('2026-11-11T05:00:00Z'), available: async () => 3,
};
const pricing = new PricingService({} as never, fakeCore as never);
const fakeDb = { unitType: { findUnique: async () => ut }, promotion: { findMany: async () => [] } } as never;
const quote = (term: number, billingMode: 'MONTHLY' | 'PREPAID_TERM') => pricing.compute(fakeDb, { unitTypeId: 1n, startDate: new Date('2026-11-20T00:00:00Z'), termMonths: term, billingMode, customerId: null });

test('quote: pay monthly for 6 months bills 1 month at the 6-month rate', async () => {
  const q = await quote(6, 'MONTHLY');
  assert.equal(Number(q.monthly), 900_000);
  assert.equal(Number(q.rent), 900_000);
  assert.equal(Number(q.deposit), 1_000_000); // deposit = 1 month of LIST price, not the discounted rate
  assert.match(q.lines[0].description, /giảm 10%/);
});

test('quote: prepaying 6 months bills 6 months at the lower prepaid rate', async () => {
  const q = await quote(6, 'PREPAID_TERM');
  assert.equal(Number(q.monthly), 873_000); // 1,000,000 x 0.90 x 0.97
  assert.equal(Number(q.rent), 5_238_000);
  assert.ok(Number(q.rent) < 6 * 900_000);
  assert.match(q.lines[0].description, /trả trước cả kỳ/);
});

test('quote: a 1-month booking is unchanged', async () => {
  const q = await quote(1, 'MONTHLY');
  assert.equal(Number(q.monthly), 1_000_000);
  assert.equal(q.termDiscountPct, 0);
});
