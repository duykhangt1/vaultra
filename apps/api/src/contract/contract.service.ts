import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, notFound, validation } from '../common/errors';
import { D, newId, nextCode, sha256 } from '../common/util';
import { addDays, addMonths, fmtDate, fmtDateTime, ymd } from '../common/dates';
import { CoreService, fmt } from '../domain/core.service';
import { PdfService, PdfSection, PdfOptions } from '../media/pdf.service';
import { buildContract, ContractSig } from './contract-template';
import { splitSignature } from '../common/signature';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { config } from '../common/config';
import { formatInTimeZone } from 'date-fns-tz';
import type { AccessContext } from '../auth/access-context';
import { INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { Prisma } from '../generated/prisma/client';


function formatBoundedSupportTicketUnitDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardUnitSlotPromoCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

interface VerifiedExpressDepositContractSnapshot {
  readonly facilityId: string;
  readonly unitCode: string;
  readonly contractRef: string;
  readonly customerId: string;
}
const TEMPLATE_VERSION = '2026.12';
