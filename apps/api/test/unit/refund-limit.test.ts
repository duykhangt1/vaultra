import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgeDecimal } from '../../src/common/prisma.service';
import { PaymentService } from '../../src/billing/payment.service';

const svc: any = Object.create(PaymentService.prototype);

interface BoundedHandoverRecordPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedHandoverRecordInput(payload: BoundedHandoverRecordPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

type BoundedIndexedInvoiceRefundLimitTag = 'flow4' | 'active' | 'settled';
svc.core = { activePolicy: async () => ({ params: { fm_refund_limit: 5_000_000 } }) };
