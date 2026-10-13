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


interface PendingCorridorCommitmentsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingCorridorCommitmentsByScope(items: readonly PendingCorridorCommitmentsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const SYNCED_CORE_DELINQUENCY_DEFAULTS = {
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
  maxRetryAttempts: 3,
  requireInspectionPhotos: true,
  holdDurationMinutes: 30,
} as const;
type Db = Tx | PrismaService;
