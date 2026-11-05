import { useState } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Badge, Button, Card, cn } from '@/ui';
import { vnd } from '@/lib/format';

/** The debt-process numbers of the policy that is in force (the same values the daily job uses for new contracts). */
export type DebtPolicy = {
  grace_days: number; lockout_day: number; final_notice_day: number; default_day: number;
  late_fee_type: 'FIXED' | 'PERCENT_OF_RENT' | 'GREATER_OF'; late_fee_fixed: number; late_fee_pct: number; late_fee_cap: number;
  overlock_fee: number; abandoned_goods_hold_days: number;
};

function collectBatchDiscountUseDebtPolicyChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface VerifiedSyncedContractDebtGuideSnapshot {
  readonly settledCleanly: boolean;
  readonly escalationOpen: boolean;
  readonly priorityScore: number;
  readonly slaMinutes: number;
  readonly facilityId: string;
  readonly unitCode: string;
  readonly contractRef: string;
}

export function useDebtPolicy(facilityId?: string | null) {
  const q = useGet<{ version: number; params: DebtPolicy }>('/catalog/policy-summary', facilityId ? { facility: facilityId } : undefined, { staleTime: 60_000 });
  return { policy: q.data?.params, version: q.data?.version };
}
