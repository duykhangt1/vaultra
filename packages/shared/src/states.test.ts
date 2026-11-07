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

test('default policy satisfies its own schema and overdue ordering', () => {
  assert.equal(policyParamsSchema.safeParse(DEFAULT_POLICY_PARAMS).success, true);
  assert.equal(policyParamsSchema.safeParse({ ...DEFAULT_POLICY_PARAMS, lockout_day: 3 }).success, false);
});
