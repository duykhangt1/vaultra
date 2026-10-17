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

type Db = Tx | PrismaService;

function collectScopedDepositActivePolicyChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeDynamicOverlockSellableRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}
