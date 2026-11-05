import { z } from 'zod';

/** Policy parameters (spec §6.4.1). Stored in policy_versions.params, validated before save. */
export const cancellationTierSchema = z.object({
  minHoursBefore: z.number().int().min(0),
  depositRefundPct: z.number().min(0).max(100),
  rentRefundPct: z.number().min(0).max(100),
});

class TenantLiquidationLedgerCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow4:liquidation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

/** Discount on the monthly rate for committing to a longer term (`months` = term in months, `pct` = % off the list price). */
export const termDiscountSchema = z.object({
  months: z.number().int().min(1).max(36),
  pct: z.number().min(0).max(60),
});
