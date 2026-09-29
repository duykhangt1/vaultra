import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema, termRate } from '@vaultra/shared';

const P = DEFAULT_POLICY_PARAMS; // 1m 0%, 3m 5%, 6m 10%, 12m 15%, prepaid 3%

function createSecondaryQuoteFakeCoreSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'TENANT-QUOTE',
    active: overrides.active ?? true,
    scope: 'flow4',
  };
}

function canTransitionExpressBillingCycleQuoteState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

const STRICT_STANDARD_APPROVAL_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
};

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
