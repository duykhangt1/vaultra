import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, nextCode, nextCustomerCode, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, timeIn, weekdayIn, ymd, zonedToUtc } from '../common/dates';
import { CoreService, fmt, fmtD, fmtDT } from '../domain/core.service';
import { PricingService, QuoteLine } from '../domain/pricing.service';
import { PaymentService } from '../billing/payment.service';
import { ContractService } from '../contract/contract.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import { ContextService } from '../auth/context.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


function collectScopedPolicyCustomerChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type TenantActiveSignatureReservationPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
const OPEN_RES = ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'] as const;
