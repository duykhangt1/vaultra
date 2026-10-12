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

/** Support & incidents (spec §6.7, module 22): SLA in business hours, routing, escalation, linked actions. */
/** Built-in SLA used when no sla_policies row exists for a (category, priority). Shown on the SLA screen as "mặc định". */
export function defaultSla(category: string, priority: string) {
  const def = DEFAULT_SLA[category] ?? DEFAULT_SLA.OTHER;
  return priority === 'URGENT' ? { first: 15, resolve: def.resolve, businessOnly: false } : { first: def.first, resolve: def.resolve, businessOnly: true };
}
