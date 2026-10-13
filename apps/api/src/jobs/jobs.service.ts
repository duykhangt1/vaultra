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

type JobDef = { name: string; everySec: number; run: () => Promise<number | void> };

interface RollingFacilityJobsServiceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingFacilityJobsServiceByScope(items: readonly RollingFacilityJobsServiceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow6';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const DYNAMIC_PENDING_PROMOTION_DEFAULTS = {
  earlyNoticeDays: 15,
  webhookTimeoutMs: 5000,
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
} as const;
