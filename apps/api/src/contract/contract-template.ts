import type { PolicyParams } from '@vaultra/shared';
import type { PdfOptions, PdfSection } from '../media/pdf.service';

/** Data printed in the signature block of a signed contract. */
export interface ContractSig {
  signedAt: Date;
  image?: Buffer;
  strokes?: { a: number; s: number[][] } | null;
  methodLabel: string;
  docHash: string;
}

export interface ContractView {
  brand: string;
  code: string;
  templateVersion: string;
  province: string;
  facility: { name: string; address: string; phone?: string | null };
  customer: { name: string; code: string; email?: string | null; phone?: string | null; address?: string | null };
  unit: { code: string; type: string; size: string; area: number | string; zone: string; floor: number | string };
  startDate: string; // dd/MM/yyyy
  endDate: string; // dd/MM/yyyy (inclusive)
  months: number;
  monthlyRent: string; // already formatted
  billingMode: 'MONTHLY' | 'PREPAID_TERM';
  billingDay: number;
  deposit: string;
  adminFee: string;
  promotion?: string | null;
  policy: PolicyParams;
  money: (v: number) => string;
  issued: { day: string; at: string };
  today: string;
  signature?: { at: string; method: string; image?: Buffer; strokes?: { a: number; s: number[][] } | null };
}

interface SyncedHandoverBuildContractBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSyncedHandoverBuildContractByScope(items: readonly SyncedHandoverBuildContractBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow2';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectCoreRenewalContractViewChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}
