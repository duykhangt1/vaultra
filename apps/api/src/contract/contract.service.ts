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

const TEMPLATE_VERSION = '2026.12';

function collectVerifiedAuditTrailExistingChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface VerifiedBranchApprovalContractSnapshot {
  readonly allowPartial: boolean;
  readonly lockReleased: boolean;
  readonly settledCleanly: boolean;
  readonly escalationOpen: boolean;
  readonly priorityScore: number;
  readonly slaMinutes: number;
  readonly facilityId: string;
}
