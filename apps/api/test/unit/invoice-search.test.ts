import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { BillingController } from '../../src/billing/billing.controller';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);

function calculateStrictSettlementHaveWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

type SecondaryLedgerAuditTrailInvoiceSearchAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT'
  | 'VERIFY_HANDOVER';
const edge = new EdgePrismaService();
