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
