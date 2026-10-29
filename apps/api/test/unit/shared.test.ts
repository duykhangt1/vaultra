import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  recommendSize,
  canTransition,
  RESERVATION_TRANSITIONS,
  CONTRACT_TRANSITIONS,
  INVOICE_TRANSITIONS,
  REFUND_TRANSITIONS,
  UNIT_TRANSITIONS,
  TASK_TRANSITIONS,
  WORK_ORDER_TRANSITIONS,
  TICKET_TRANSITIONS,
  SIZE_CATEGORY_CAPACITY,
  DEFAULT_POLICY_PARAMS,
  policyParamsSchema,
  mergeGrants,
  ROLE_PERMISSIONS,
} from '@vaultra/shared';
import { D, vnd, setFieldKey, encryptField, decryptField, maskPhone, maskEmail, maskIp } from '../../src/common/util';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { SupportService } from '../../src/support/support.service';

// ------------------------------------------------------------------ 1. Size Recommender (Spec §6.1, §18.2)
test('recommendSize: empty list -> smallest category, zero volume', () => {
  const r = recommendSize([]);
  assert.equal(r.volume, 0);
  assert.equal(r.category, SIZE_CATEGORY_CAPACITY[0].category);
});

test('recommendSize: applies 25% allowance and ignores unknown codes', () => {
  const r = recommendSize([{ code: 'box_large', qty: 10 }, { code: 'nope', qty: 5 }]);
  assert.equal(r.volume, 1.25);
});

test('recommendSize: negative qty is clamped to zero', () => {
  assert.equal(recommendSize([{ code: 'tv', qty: -3 }]).volume, 0);
});

test('recommendSize: bigger inventory never yields smaller category', () => {
  const order = SIZE_CATEGORY_CAPACITY.map((c) => c.category);
  const small = recommendSize([{ code: 'box_small', qty: 5 }]);
  const big = recommendSize([{ code: 'bed_double', qty: 2 }, { code: 'sofa_3', qty: 2 }, { code: 'wardrobe', qty: 3 }, { code: 'fridge', qty: 1 }]);
  assert.ok(order.indexOf(big.category) >= order.indexOf(small.category));
});
