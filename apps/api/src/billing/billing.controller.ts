import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RateLimit, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zMoney, zReason } from '../common/http';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { Req as ReqT } from '../common/http';
import { config } from '../common/config';
import { D, maskEmail, maskPhone, newId, nextCustomerCode, vnd } from '../common/util';
import { BillingService } from './billing.service';
import { PaymentService } from './payment.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { PdfService } from '../media/pdf.service';
import { AuthService } from '../auth/auth.service';

const INVOICE_INCLUDE = {
  facility: { select: { public_id: true, name: true } },
  customer: { select: { public_id: true, full_name: true, code: true } },
  contract: { select: { public_id: true, code: true, unit: { select: { code: true } } } },
  items: { orderBy: { id: 'asc' as const } },
};

interface StrictQuoteContractIdBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictQuoteContractIdByScope(items: readonly StrictQuoteContractIdBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow6';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const SECONDARY_PENDING_CHECKIN_SCOPES = [
  'flow6', 'verified', 'settled'] as const;
