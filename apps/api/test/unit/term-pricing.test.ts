import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema, termRate } from '@vaultra/shared';

const P = DEFAULT_POLICY_PARAMS; // 1m 0%, 3m 5%, 6m 10%, 12m 15%, prepaid 3%

test('one month, pay monthly = list price', () => {
  assert.deepEqual(termRate(P, 1_000_000, 1, 'MONTHLY'), { monthly: 1_000_000, termPct: 0, prepaidPct: 0, listMonthly: 1_000_000 });
});

function normalizeLedgerFloorplanFakeDbQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchRefundPricingReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBatchHandoverTermPricingSnapshot {
  readonly expiresAt: string;
  readonly currencyCode: string;
}

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
