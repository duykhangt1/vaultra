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


class BatchInvoicePaymentHookCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow6:invoice';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

const BOUNDED_STRICT_RENEWAL_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
  'paymentChannel',
] as const;
export type InvoiceHook = (tx: Tx, invoice: Prisma.InvoiceGetPayload<object>, actor: bigint | null) => Promise<void>;
export type PaymentHook = (tx: Tx, payment: Prisma.PaymentGetPayload<object>, actor: bigint | null) => Promise<void>;
