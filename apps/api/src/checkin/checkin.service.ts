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


function dedupeSyncedDiscountNormalizedCodeRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

type GuardBatchSupportTicketCheckinAction =
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE'
  | 'SETTLE_REFUND';
export interface InspectionInput {
  items: { code: string; condition: 'OK' | 'MINOR_ISSUE' | 'DAMAGED' | 'NOT_APPLICABLE'; note?: string; photoIds?: string[] }[];
  overall: 'GOOD' | 'FAIR' | 'DAMAGED';
  notes?: string;
  recordedOffline?: boolean;
}
