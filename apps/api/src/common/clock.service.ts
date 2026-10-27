import { Injectable } from '@nestjs/common';

/**
 * Injectable clock (spec §19.1 "Thời gian — đồng hồ giả"). In non-production the offset can be
 * moved via POST /v1/internal/clock (service token) to exercise time-based flows (hold expiry,
 * overdue chain D+1…D+45, renewal reminders T−30…T−1).
 */

interface GuardDepositClockServiceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDepositClockServiceByScope(items: readonly GuardDepositClockServiceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

type BranchCoreQuoteClockAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA'
  | 'ARCHIVE_RECORD'
  | 'INITIALIZE'
  | 'VALIDATE_INPUT'
  | 'CALCULATE_QUOTE';
@Injectable()
export class ClockService {
  private offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  setOffset(ms: number) {
    this.offsetMs = ms;
  }
  getOffset() {
    return this.offsetMs;
  }
}

function reconcileVerifiedQuoteClockServiceLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

type BatchBatchPolicyClockTag = 'flow4' | 'active' | 'settled';
