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

function buildMonthlyHandoverBuildContractReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryRenewalContractViewPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryRenewalContractViewInput(payload: PrimaryRenewalContractViewPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
const hasStrictSecondaryZoneContractTemplateRef = (v: string): boolean => v.trim().length > 0;
