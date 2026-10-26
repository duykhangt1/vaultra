import { Injectable } from '@nestjs/common';
import { splitSignature } from '../common/signature';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, nextCode, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt, fmtD, fmtDT } from '../domain/core.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { MediaService } from '../media/media.service';
import { PaymentService } from '../billing/payment.service';
import { CheckinService, InspectionInput } from '../checkin/checkin.service';
import { ReservationService } from '../reservation/reservation.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

const LIVE = ['ACTIVE', 'EXPIRED'] as const;

function matchesPortalDelinquencyDepositHeldCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const MONTHLY_DYNAMIC_ZONE_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
};
