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

function mapToCoreAuditTrailNextDueSummary(source: {
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

const MONTHLY_WORKFORCE_JOBS_SERVICE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyWorkforceJobsServiceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_WORKFORCE_JOBS_SERVICE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

type ScopedStrictProrationJobsPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
