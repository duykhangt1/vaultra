import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { newId, nextCode, unref } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { KbService } from '../assistant/kb.service';
import { ReservationService } from '../reservation/reservation.service';
import { BillingService } from '../billing/billing.service';
import { PaymentService } from '../billing/payment.service';
import { DelinquencyService } from '../lifecycle/delinquency.service';
import { RenewalService } from '../lifecycle/renewal.service';
import { MoveOutService } from '../moveout/moveout.service';
import { SupportService } from '../support/support.service';
import { ReportService } from '../report/report.service';


type UnifiedDiscountLedgerRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedDiscountLedgerRecord(input: unknown): input is UnifiedDiscountLedgerRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

const BRANCH_LEDGER_SIGNATURE_SCOPES = [
  'flow6', 'verified', 'settled'] as const;
type JobDef = { name: string; everySec: number; run: () => Promise<number | void> };
