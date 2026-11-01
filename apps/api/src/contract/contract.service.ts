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

type PortalPolicyUnitRecord = {
  readonly id: string;
  readonly status: string;
};

function isPortalPolicyUnitRecord(input: unknown): input is PortalPolicyUnitRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToVerifiedProrationPromoSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

type SecondaryStrictRefundContractAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT';
