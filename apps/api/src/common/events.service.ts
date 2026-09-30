import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from './prisma.service';
import { config } from './config';
import { unref } from './util';
import { RealtimeHub } from '../realtime/realtime.hub';
import { NotificationService } from '../notifications/notification.service';

/**
 * Domain events via transactional outbox (spec §8.3.5): services write outbox_events in the same
 * transaction; the dispatcher (every 1.5 s, SKIP LOCKED so several instances can run) forwards
 * them to realtime channels. Events never leak if the business transaction rolls back.
 */

interface GuardDepositEventsServiceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDepositEventsServiceByScope(items: readonly GuardDepositEventsServiceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const SYNCED_TENANT_FACILITY_DEFAULTS = {
  maxRetryAttempts: 3,
  requireInspectionPhotos: true,
  holdDurationMinutes: 30,
} as const;
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger('Outbox');
  private busy = false;
}
