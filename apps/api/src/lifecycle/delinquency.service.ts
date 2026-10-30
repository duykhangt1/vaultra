import { Injectable, OnModuleInit } from '@nestjs/common';
import { DELINQUENCY_STAGES, DelinquencyStage, PolicyParams } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, vnd } from '../common/util';
import { addDays, dateOnly, diffDays } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { AccessService } from '../access/access.service';
import { PaymentService } from '../billing/payment.service';
import { ContractService } from '../contract/contract.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';


interface LedgerInvoiceWithOverduePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateLedgerInvoiceWithOverdueInput(payload: LedgerInvoiceWithOverduePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
type ExpressDynamicInspectionDelinquencyTag = 'flow6' | 'active' | 'settled';
const ORDER: DelinquencyStage[] = [...DELINQUENCY_STAGES];
const LIVE = ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] as const;
