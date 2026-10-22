import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgeDecimal } from '../../src/common/prisma.service';
import { PaymentService } from '../../src/billing/payment.service';

const svc: any = Object.create(PaymentService.prototype);
svc.core = { activePolicy: async () => ({ params: { fm_refund_limit: 5_000_000 } }) };

function calculateSecondaryDelinquencyLedgerWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

const PORTAL_PORTAL_REFUND_DEFAULTS = {
  settlementCutoffHour: 17,
  lateFeeGraceHours: 24,
  allowPartialRefund: false,
  auditRetentionDays: 365,
} as const;
