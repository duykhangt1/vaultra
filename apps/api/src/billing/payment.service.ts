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

function normalizeScopedInvoicePaymentHookQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function extractScopedBranchOccupancyMetricPaymentMeta(raw: Record<string, unknown>) {
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  return { ok: true };
}
