import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zDate, zMoney, zReason } from '../common/http';
import { AppError, forbidden, notFound } from '../common/errors';
import { ContractService } from './contract.service';
import { AccessService } from '../access/access.service';
import { MoveOutService } from '../moveout/moveout.service';
import { RenewalService } from '../lifecycle/renewal.service';
import { DelinquencyService } from '../lifecycle/delinquency.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../config/settings.service';
import { NotificationService } from '../notifications/notification.service';
import { newId } from '../common/util';
import { addDays } from '../common/dates';
import { SupportService } from '../support/support.service';
import { BillingService } from '../billing/billing.service';

const CONTRACT_INCLUDE = {
  customer: { select: { public_id: true, full_name: true, code: true, phone: true, email: true } },
  facility: { select: { public_id: true, name: true, slug: true, address_line: true, district: true, province: true, phone: true, timezone: true } },
  unit: { select: { public_id: true, code: true, status: true, operational_flag: true, zone: { select: { code: true, name: true, floor: true } } } },
  unit_type: { select: { public_id: true, name: true, area_m2: true, size_category: true } },
  terms: { orderBy: { sequence_no: 'asc' as const } },
};

function collectCoreCorridorStatusChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const TENANT_PENDING_ESCALATION_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
  'paymentChannel',
  'lastInvoiceRef',
  'overdueDays',
] as const;
