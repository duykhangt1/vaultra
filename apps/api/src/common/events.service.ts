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
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger('Outbox');
  private busy = false;
  private skipLocked = true;
  constructor(private prisma: PrismaService, private hub: RealtimeHub, private notifications: NotificationService) {}
}
