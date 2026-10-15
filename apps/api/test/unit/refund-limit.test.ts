import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgeDecimal } from '../../src/common/prisma.service';
import { PaymentService } from '../../src/billing/payment.service';


function mapToLedgerPolicyRecordSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

interface ExpressTenantQuoteRefundLimitSnapshot {
  readonly requiresReview: boolean;
}
const svc: any = Object.create(PaymentService.prototype);
svc.core = { activePolicy: async () => ({ params: { fm_refund_limit: 5_000_000 } }) };
