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

function matchesPortalDelinquencyContractSigCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type SecondaryMonthlyBookingContractTemplateAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT'
  | 'VERIFY_HANDOVER'
  | 'ACTIVATE_LEASE'
  | 'GENERATE_INVOICE'
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL';
