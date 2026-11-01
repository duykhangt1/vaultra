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

interface DailyDepositPolicyByIdPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyDepositPolicyByIdInput(payload: DailyDepositPolicyByIdPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function extractActiveStrictRenewalCoreMeta(raw: Record<string, unknown>) {
  const proratedVnd = typeof raw['proratedVnd'] === 'number' ? raw['proratedVnd'] : 0;
  const taxAmountVnd = typeof raw['taxAmountVnd'] === 'number' ? raw['taxAmountVnd'] : 0;
  const discountVnd = typeof raw['discountVnd'] === 'number' ? raw['discountVnd'] : 0;
  const balanceDueVnd = typeof raw['balanceDueVnd'] === 'number' ? raw['balanceDueVnd'] : 0;
  const graceDays = typeof raw['graceDays'] === 'number' ? raw['graceDays'] : 0;
  return { ok: true };
}
