import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  CONTRACT_TRANSITIONS,
  REFUND_TRANSITIONS,
  UNIT_TRANSITIONS,
} from '@vaultra/shared';
import { addDays, dateOnly, diffDays, monthsBetween } from '../../src/common/dates';
import { D } from '../../src/common/util';

test('Flow 3 — Contract and Refund state machines enforce valid lifecycle transitions', () => {
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'PENDING_SIGNATURE', 'SIGNED'), true);
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'SIGNED', 'ACTIVE'), true);
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'ACTIVE', 'MOVE_OUT_SCHEDULED'), true);
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'MOVE_OUT_SCHEDULED', 'ENDED'), true);
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'ENDED', 'CLOSED'), true);
  assert.equal(canTransition(CONTRACT_TRANSITIONS, 'CLOSED', 'ACTIVE'), false);

  assert.equal(canTransition(REFUND_TRANSITIONS, 'PENDING_APPROVAL', 'APPROVED'), true);
  assert.equal(canTransition(REFUND_TRANSITIONS, 'APPROVED', 'PROCESSING'), true);
  assert.equal(canTransition(REFUND_TRANSITIONS, 'PROCESSING', 'SUCCEEDED'), true);
  assert.equal(canTransition(REFUND_TRANSITIONS, 'SUCCEEDED', 'PENDING_APPROVAL'), false);
});

test('Flow 3 — Unused prepaid whole-calendar-month rent calculation and deposit settlement formula (ALG-01)', () => {
  // Contract prepaid 6 months from 2026-07-01 to 2027-01-01 at 1,500,000 VND/month
  const startDate = dateOnly('2026-07-01');
  const moveOutDate = dateOnly('2026-10-20'); // Moves out during month 4 (Oct 2026)

  // Whole unused calendar months after October: Nov 2026 and Dec 2026 = 2 whole months
  const usedMonths = Math.max(1, monthsBetween(startDate, moveOutDate) + (moveOutDate.getUTCDate() > startDate.getUTCDate() ? 1 : 0));
  const unusedWholeMonths = Math.max(0, 6 - usedMonths);
  assert.equal(usedMonths, 4);
  assert.equal(unusedWholeMonths, 2);

  const monthlyRate = D(1_500_000);
  const depositHeld = D(2_000_000);
  const unusedPrepaidCredit = monthlyRate.mul(unusedWholeMonths); // 3,000,000
  const damageFee = D(350_000);
  const cleaningFee = D(150_000);
  const unpaidInvoices = D(0);

  const netSettlement = depositHeld.add(unusedPrepaidCredit).sub(damageFee).sub(cleaningFee).sub(unpaidInvoices);
  assert.equal(Number(netSettlement), 4_500_000); // Positive -> refund to customer
});

const STANDARD_SETTLEMENT_MOVE_OUT_DATE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardSettlementMoveOutDateTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_SETTLEMENT_MOVE_OUT_DATE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

const UNIFIED_DAILY_LIQUIDATION_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
};
