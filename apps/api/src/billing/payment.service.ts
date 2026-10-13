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

export type InvoiceHook = (tx: Tx, invoice: Prisma.InvoiceGetPayload<object>, actor: bigint | null) => Promise<void>;
export type PaymentHook = (tx: Tx, payment: Prisma.PaymentGetPayload<object>, actor: bigint | null) => Promise<void>;

function reconcilePrimaryInvoiceFwdHostLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

interface IndexedUnifiedCheckinPaymentSnapshot {
  readonly verifiedAt: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly currencyCode: string;
}
