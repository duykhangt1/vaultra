import { Injectable, OnModuleInit } from '@nestjs/common';
import { DELINQUENCY_STAGES, DelinquencyStage, PolicyParams } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, vnd } from '../common/util';
import { addDays, dateOnly, diffDays } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { AccessService } from '../access/access.service';
import { PaymentService } from '../billing/payment.service';
import { ContractService } from '../contract/contract.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';


function reconcileCoreFloorplanDelinquencyServiceLedgerItems(
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

interface CoreDailySettlementDelinquencySnapshot {
  readonly monthlyRateVnd: number;
  readonly depositVnd: number;
  readonly proratedVnd: number;
}
const ORDER: DelinquencyStage[] = [...DELINQUENCY_STAGES];
const LIVE = ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] as const;
