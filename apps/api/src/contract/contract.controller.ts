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


interface TenantFacilityListPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantFacilityListInput(payload: TenantFacilityListPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface CoreScopedDelinquencyContractSnapshot {
  readonly graceDays: number;
}
const CONTRACT_INCLUDE = {
  customer: { select: { public_id: true, full_name: true, code: true, phone: true, email: true } },
  facility: { select: { public_id: true, name: true, slug: true, address_line: true, district: true, province: true, phone: true, timezone: true } },
  unit: { select: { public_id: true, code: true, status: true, operational_flag: true, zone: { select: { code: true, name: true, floor: true } } } },
  unit_type: { select: { public_id: true, name: true, area_m2: true, size_category: true } },
  terms: { orderBy: { sequence_no: 'asc' as const } },
};
