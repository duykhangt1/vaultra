/**
 * Unit tests that pin the algorithm / money defects found by the audit (see /AUDIT_REPORT.md).
 * Each test asserts the CORRECT behaviour, so it FAILS while the defect exists and passes once fixed.
 * Run: pnpm --filter @vaultra/api test:audit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS } from '@vaultra/shared';
import { D } from '../../src/common/util';
import { addMonths, billingPeriodStarts, dateOnly, diffDays } from '../../src/common/dates';
import { CoreService } from '../../src/domain/core.service';
import { MoveOutService } from '../../src/moveout/moveout.service';

// ------------------------------------------------------------------ helpers
function fakeTx() {
  const created: { invoice?: any } = {};
  const tx: any = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ v: 7n }],
    invoice: { create: async ({ data }: any) => { created.invoice = data; return { ...data, id: 1n, public_id: data.public_id, items: data.items.create.map((i: any, n: number) => ({ ...i, id: BigInt(n + 1) })) }; } },
    customerLedgerEntry: { create: async () => ({}), aggregate: async () => ({ _sum: { amount: 0 } }) },
    customer: { update: async () => ({}), findUnique: async () => null },
  };
  return { tx, created };
}
const core = () => new (CoreService as any)(null, { now: () => new Date('2026-11-08T03:00:00Z') }, null, { notify: async () => undefined }) as CoreService;

// ------------------------------------------------------------------ FIN-01 / FIN-03  invoice VAT
test('FIN-01 VAT-inclusive invoice: VAT contained in the lines is computed net of the discount', async () => {
  const { tx, created } = fakeTx();
  await core().createInvoice(tx, {
    customerId: 1n, facilityId: 1n, type: 'RESERVATION', dueDate: dateOnly('2026-11-08'), vatRate: 10, pricesIncludeVat: true, notify: false,
    items: [
      { item_type: 'RENT', description: 'rent', amount: 1_000_000, taxable: true },
      { item_type: 'DISCOUNT', description: 'promo', amount: -200_000 },
      { item_type: 'FEE', description: 'admin fee', amount: 100_000, taxable: true },
    ],
  });
  // quote/pricing.compute(): taxable = rent - discount + admin = 900 000  ->  VAT = 900 000 * 10 / 110 = 81 818
  const lineVat = created.invoice.items.create.reduce((s: number, i: any) => s + Number(i.tax_amount), 0);
  assert.equal(lineVat, 81_818, `sum of item tax_amount was ${lineVat}`);
  assert.equal(Number(created.invoice.tax_total), 0, 'tax_total is the VAT ADDED on top (DB check total = subtotal - discount + tax_total)');
  assert.equal(Number(created.invoice.total), 900_000);
});

test('FIN-03 VAT-exclusive invoice taxes the amount AFTER the discount', async () => {
  const { tx, created } = fakeTx();
  await core().createInvoice(tx, {
    customerId: 1n, facilityId: 1n, type: 'RESERVATION', dueDate: dateOnly('2026-11-08'), vatRate: 10, pricesIncludeVat: false, notify: false,
    items: [
      { item_type: 'RENT', description: 'rent', amount: 1_000_000, taxable: true },
      { item_type: 'DISCOUNT', description: 'promo', amount: -200_000 },
    ],
  });
  // VAT must be 10 % of 800 000 = 80 000, total 880 000
  assert.equal(Number(created.invoice.tax_total), 80_000, `tax_total ${created.invoice.tax_total}`);
  assert.equal(Number(created.invoice.total), 880_000, `total ${created.invoice.total}`);
});

// ------------------------------------------------------------------ BIZ-10  recurring billing date drift
test('BIZ-10 chained addMonths() keeps the billing day (no drift after a short month)', () => {
  const start = dateOnly('2026-01-31');
  const end = addMonths(start, 12); // contract: 12 months
  // billing.runRecurring() derives every period from the contract start (billingPeriodStarts / monthsBetween), never by chaining
  const periods = billingPeriodStarts(start, end, 1);
  assert.equal(periods.length, 12, `a 12-month contract produced ${periods.length} rent periods (${periods.map((p) => p.toISOString().slice(0, 10)).join(', ')})`);
  assert.equal(periods[11].toISOString().slice(0, 10), '2026-12-31');
});

// ------------------------------------------------------------------ ALG-01  unused prepaid months at move-out
test('ALG-01 early move-out refunds every full unused prepaid month (boundary date)', async () => {
  const contract = { id: 1n, policy_version_id: 1n, start_date: dateOnly('2026-07-01'), current_end_date: dateOnly('2027-01-01'), billing_mode: 'PREPAID_TERM', monthly_rent: D(1_000_000) };
  const db: any = {
    contract: { findUniqueOrThrow: async () => contract },
    deposit: { findFirst: async () => null },
    invoice: { findMany: async () => [] },
  };
  const policyCore: any = { policyById: async () => ({ ...DEFAULT_POLICY_PARAMS, early_termination_refund: 'UNUSED_FULL_MONTHS', early_termination_fee: 0 }) };
  const svc = new (MoveOutService as any)(null, policyCore, null, null, null, null, null, null, null, null) as MoveOutService;
  const est = await svc.estimate(db, 1n, dateOnly('2026-09-01'));
  // periods Jul, Aug are used; Sep, Oct, Nov, Dec are entirely after the move-out date -> 4 months
  assert.equal(est.prepaidRefund, 4_000_000, `refund was ${est.prepaidRefund} (only ${est.prepaidRefund / 1_000_000} month(s))`);
});

// ------------------------------------------------------------------ sanity checks that must stay green
test('addMonths clamps to the end of the month (kept green)', () => {
  assert.equal(addMonths(dateOnly('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(addMonths(dateOnly('2028-01-31'), 1).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(diffDays(dateOnly('2026-03-01'), dateOnly('2026-02-01')), 28);
});
