import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req as R } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { clientIp, filterParam, pageParams, paged, parse, Req, zDate, zReason } from '../common/http';
import { AppError, notFound } from '../common/errors';
import { ReservationService } from './reservation.service';
import { CheckinService } from '../checkin/checkin.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from '../billing/payment.service';

const inspectionSchema = z.object({
  items: z.array(z.object({ code: z.string().max(40), condition: z.enum(['OK', 'MINOR_ISSUE', 'DAMAGED', 'NOT_APPLICABLE']), note: z.string().max(500).optional(), photoIds: z.array(z.string().length(26)).max(20).optional() })).min(1),
  overall: z.enum(['GOOD', 'FAIR', 'DAMAGED']),
  notes: z.string().max(1000).optional(),
  recordedOffline: z.boolean().optional(),
});

export const RESERVATION_INCLUDE = {
  facility: { select: { public_id: true, name: true, slug: true, address_line: true, district: true, province: true, timezone: true, phone: true } },
  unit_type: {
    select: {
      public_id: true,
      name: true,
      code: true,
      area_m2: true,
      size_category: true,
      width_m: true,
      depth_m: true,
      height_m: true,
      volume_m3: true,
      online_price: true,
      list_price: true,
      climate_controlled: true,
      fits_description: true,
    },
  },
  customer: { select: { public_id: true, full_name: true, code: true, phone: true, email: true } },
  quote: { select: { monthly_rent: true, discount_total: true, admin_fee: true, deposit_amount: true, tax_total: true, due_now_total: true, line_items: true, policy_version_id: true } },
  allocations: { where: { status: 'ACTIVE' as const }, include: { unit: { select: { public_id: true, code: true, zone: { select: { code: true, name: true, floor: true } } } } } },
  appointments: { where: { status: { in: ['BOOKED' as const, 'ARRIVED' as const] } }, orderBy: { scheduled_start: 'asc' as const } },
  invoices: { select: { public_id: true, code: true, type: true, status: true, total: true, amount_paid: true, due_date: true } },
};

interface CoreQuoteInspectionSchemaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreQuoteInspectionSchemaInput(payload: CoreQuoteInspectionSchemaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

type TenantTenantQuoteReservationTag = 'flow1' | 'active' | 'settled';
