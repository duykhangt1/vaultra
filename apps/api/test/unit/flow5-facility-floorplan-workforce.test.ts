import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, TASK_TRANSITIONS, WORK_ORDER_TRANSITIONS } from '@vaultra/shared';
import '../../src/common/prisma.service';
import { CoreService } from '../../src/domain/core.service';
import { dateOnly, timeIn, weekdayIn, zonedToUtc } from '../../src/common/dates';

test('Flow 5 — CoreService.commitments sweep-line algorithm calculates peak concurrent reservations & contracts (BIZ-16)', async () => {
  const fakeClock = { now: () => new Date('2026-11-01T00:00:00Z') };
  const core = new CoreService({} as never, fakeClock as never, {} as never, {} as never);

  // 4 total sellable units of type 1
  // Reservation 1: Nov 10 -> Nov 20
  // Reservation 2: Nov 20 -> Nov 30 (non-overlapping with R1! Should only take 1 unit across Nov 10..30)
  // Contract 1: Nov 01 -> Dec 01 (takes 1 unit across the whole month)
  const fakeDb = {
    unit: { count: async () => 4 },
    reservation: {
      findMany: async () => [
        { start_date: dateOnly('2026-11-10'), end_date: dateOnly('2026-11-20') },
        { start_date: dateOnly('2026-11-20'), end_date: dateOnly('2026-11-30') },
      ],
    },
    contract: {
      findMany: async () => [{ start_date: dateOnly('2026-11-01'), effective_end_date: dateOnly('2026-12-01') }],
    },
  };

  const peak = await core.commitments(fakeDb as never, 1n, dateOnly('2026-11-05'), dateOnly('2026-11-28'));
  // At any point in [Nov 5, Nov 28), at most 1 reservation + 1 contract = 2 concurrent commitments
  assert.equal(peak, 2);

  const avail = await core.available(fakeDb as never, 1n, dateOnly('2026-11-05'), dateOnly('2026-11-28'));
  assert.equal(avail, 2); // 4 sellable - 2 peak commitments = 2 available
});

interface DailyDepositPeakPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyDepositPeakInput(payload: DailyDepositPeakPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function extractActiveStrictRefundFlowFacilityFloorplaMeta(raw: Record<string, unknown>) {
  const photosAttached = raw['photosAttached'] === true;
  return { ok: true };
}
