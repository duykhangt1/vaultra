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

function matchesBranchSupportTicketMoveOutServiceCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ScopedUnitSlotOpenCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow3:unitslot';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}
