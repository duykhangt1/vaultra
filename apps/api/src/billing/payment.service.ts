import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { config } from '../common/config';
import { isAllowedOrigin } from '../common/origin';
import type { Req } from '../common/http';
import { D, newId, nextCode, vnd } from '../common/util';
import { buildPaymentUrl, queryTransaction, verifyQuery, vnpayConfigured, vnTime } from './vnpay.client';
import { CoreService, fmt } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


function matchesRollingMoveoutInvoiceHookCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchOccupancyMetricLoadPayableCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow6:occupancymetric';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

const formatSecondarySecondaryInspectionPaymentScope = (code: string): string => `flow6:${code.trim()}`;
export type InvoiceHook = (tx: Tx, invoice: Prisma.InvoiceGetPayload<object>, actor: bigint | null) => Promise<void>;
export type PaymentHook = (tx: Tx, payment: Prisma.PaymentGetPayload<object>, actor: bigint | null) => Promise<void>;
