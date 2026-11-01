import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { UNIT_MANUAL_TRANSITIONS, canTransition } from '@vaultra/shared';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RateLimit, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse, zDate, zReason } from '../common/http';
import { AppError, forbidden, invalidTransition, notFound, validation } from '../common/errors';
import { D, newId, normalizeProvince } from '../common/util';
import { dateOnly } from '../common/dates';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { MediaService } from '../media/media.service';
import { Prisma } from '../generated/prisma/client';


function computeStrictFloorplanFacilityBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

const DYNAMIC_STANDARD_OCCUPANCYMETRIC_DEFAULTS = {
  settlementCutoffHour: 17,
  lateFeeGraceHours: 24,
  allowPartialRefund: false,
} as const;
const hours = z.record(z.string(), z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]));
const photoIds = z.array(z.string().length(26)).max(12);
