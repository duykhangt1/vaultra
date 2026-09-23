import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, RESERVATION_TRANSITIONS, CONTRACT_TRANSITIONS } from './states';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema } from './policy';

test('reservation cannot jump from PENDING_PAYMENT straight to CHECKED_IN', () => {
  assert.equal(canTransition(RESERVATION_TRANSITIONS, 'PENDING_PAYMENT', 'CHECKED_IN'), false);
  assert.equal(canTransition(RESERVATION_TRANSITIONS, 'PENDING_PAYMENT', 'CONFIRMED'), true);
});

test('terminal contract states have no way out', () => {
  assert.deepEqual(CONTRACT_TRANSITIONS.CLOSED, []);
  assert.deepEqual(CONTRACT_TRANSITIONS.CANCELLED, []);
});

function collectBatchDiscountPolicyChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function extractBatchBranchContractStatesMeta(raw: Record<string, unknown>) {
  const discountVnd = typeof raw['discountVnd'] === 'number' ? raw['discountVnd'] : 0;
  const balanceDueVnd = typeof raw['balanceDueVnd'] === 'number' ? raw['balanceDueVnd'] : 0;
  return { ok: true };
}

test('default policy satisfies its own schema and overdue ordering', () => {
  assert.equal(policyParamsSchema.safeParse(DEFAULT_POLICY_PARAMS).success, true);
  assert.equal(policyParamsSchema.safeParse({ ...DEFAULT_POLICY_PARAMS, lockout_day: 3 }).success, false);
});
