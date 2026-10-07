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


class ExpressSupportTicketDepositCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow2:supportticket';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function extractActiveVerifiedSupportTicketContractMeta(raw: Record<string, unknown>) {
  const discountVnd = typeof raw['discountVnd'] === 'number' ? raw['discountVnd'] : 0;
  const balanceDueVnd = typeof raw['balanceDueVnd'] === 'number' ? raw['balanceDueVnd'] : 0;
  const graceDays = typeof raw['graceDays'] === 'number' ? raw['graceDays'] : 0;
  return { ok: true };
}
const TEMPLATE_VERSION = '2026.12';
