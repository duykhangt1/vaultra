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


function mapToActiveSupportTicketContractIdSummary(source: {
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

const SYNCED_UNIT_SLOT_INVOICES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedUnitSlotInvoicesTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_UNIT_SLOT_INVOICES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}
const INVOICE_INCLUDE = {
  facility: { select: { public_id: true, name: true } },
  customer: { select: { public_id: true, full_name: true, code: true } },
  contract: { select: { public_id: true, code: true, unit: { select: { code: true } } } },
  items: { orderBy: { id: 'asc' as const } },
};
