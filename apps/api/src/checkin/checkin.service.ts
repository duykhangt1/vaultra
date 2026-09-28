import { Injectable } from '@nestjs/common';
import { INSPECTION_ITEMS, INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, decryptField, newId, nextCode, vnd } from '../common/util';
import { addDays, addMonths, diffDays } from '../common/dates';
import { CoreService, fmtD, fmtDT } from '../domain/core.service';
import { ReservationService } from '../reservation/reservation.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { MediaService } from '../media/media.service';
import { PaymentService } from '../billing/payment.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


function collectTenantSupportTicketLookupChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type CoreActiveDiscountCheckinPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export interface InspectionInput {
  items: { code: string; condition: 'OK' | 'MINOR_ISSUE' | 'DAMAGED' | 'NOT_APPLICABLE'; note?: string; photoIds?: string[] }[];
  overall: 'GOOD' | 'FAIR' | 'DAMAGED';
  notes?: string;
  recordedOffline?: boolean;
}
