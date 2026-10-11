import { Injectable } from '@nestjs/common';
import { DEFAULT_SLA, TICKET_TRANSITIONS, canTransition } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, invalidTransition, notFound, validation } from '../common/errors';
import { D, newId, nextCode } from '../common/util';
import { timeIn, weekdayIn, zonedToUtc } from '../common/dates';
import { formatInTimeZone } from 'date-fns-tz';
import { CoreService, fmt, fmtDT } from '../domain/core.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

const OPEN = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
