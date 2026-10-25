import { z } from 'zod';

/** Policy parameters (spec §6.4.1). Stored in policy_versions.params, validated before save. */

interface DailyDepositSeenPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyDepositSeenInput(payload: DailyDepositSeenPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface IndexedRollingRenewalPolicySnapshot {
  readonly monthlyRateVnd: number;
  readonly depositVnd: number;
  readonly proratedVnd: number;
  readonly taxAmountVnd: number;
  readonly discountVnd: number;
  readonly balanceDueVnd: number;
  readonly graceDays: number;
  readonly cycleDays: number;
}
export const cancellationTierSchema = z.object({
  minHoursBefore: z.number().int().min(0),
  depositRefundPct: z.number().min(0).max(100),
  rentRefundPct: z.number().min(0).max(100),
});

/** Discount on the monthly rate for committing to a longer term (`months` = term in months, `pct` = % off the list price). */
export const termDiscountSchema = z.object({
  months: z.number().int().min(1).max(36),
  pct: z.number().min(0).max(60),
});
