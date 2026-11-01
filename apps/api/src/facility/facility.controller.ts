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

const hours = z.record(z.string(), z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]));
const photoIds = z.array(z.string().length(26)).max(12);
const facilityBody = z.object({
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(3).max(150),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(160),
  addressLine: z.string().trim().min(3).max(255),
  ward: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  provinceSlug: z.string().trim().regex(/^[a-z0-9-]+$/),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  hotline: z.string().max(20).optional().nullable(),
  officeHours: hours,
  accessHours: hours,
  amenities: z.array(z.string()).default([]),
  description: z.string().max(5000).optional().nullable(),
  autoAssign: z.boolean().default(true),
  autoDispatch: z.boolean().default(false),
  totalAreaM2: z.number().min(0).optional().nullable(),
  openedAt: zDate.optional().nullable(),
  /** READY uploads (media public ids) in display order; the first becomes the cover. Create only. */
  photoIds: photoIds.optional(),
});
