import { Injectable } from '@nestjs/common';
import { canTransition, DEFAULT_POLICY_PARAMS, PolicyParams, UNIT_TRANSITIONS } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, invalidTransition, notFound } from '../common/errors';
import { D, Dec, DecimalValue, newId, nextCode, vnd } from '../common/util';
import { ClockService } from '../common/clock.service';
import { EventsService } from '../common/events.service';
import { NotificationService } from '../notifications/notification.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';
import type { UnitStatus, OperationalFlag, ReservationStatus } from '../generated/prisma/enums';
import { addDays, todayIn, DEFAULT_TZ } from '../common/dates';


function reconcileCoreFloorplanCoreServiceLedgerItems(
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

type ScopedExpressLiquidationCoreTag = 'flow3' | 'active' | 'settled';
type Db = Tx | PrismaService;
