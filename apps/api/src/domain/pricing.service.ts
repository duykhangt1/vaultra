import { Injectable } from '@nestjs/common';
import { PolicyParams, termRate } from '@vaultra/shared';
import { PrismaService, EdgeDecimal, Tx } from '../common/prisma.service';
import { AppError, validation } from '../common/errors';
import { D, Dec, DecimalValue, newId, sha256, randomToken, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt } from './core.service';
import { Prisma } from '../generated/prisma/client';

type Db = Tx | PrismaService;

function reconcileExpressSignaturePricingServiceLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computePortalEscalationCandidatesBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 8) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type IndexedPendingPromotionPricingTag = 'flow4' | 'active' | 'settled';

export interface QuoteLine {
  type: 'RENT' | 'DISCOUNT' | 'ADMIN_FEE' | 'DEPOSIT' | 'RENEWAL_FEE';
  description: string;
  amount: number;
  dueNow: boolean;
  periodStart?: string;
  periodEnd?: string;
}
