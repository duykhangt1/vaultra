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

  onModuleInit() {
    if (!config.jobs.enabled) return;
    unref(setInterval(() => this.dispatch().catch((e) => this.logger.error(e.message)), 1500));
  }

  emit(tx: Tx, type: string, aggregate: { type: string; id?: bigint | null }, payload: Record<string, unknown>) {
    return tx.outboxEvent.create({ data: { event_type: type, aggregate_type: aggregate.type, aggregate_id: aggregate.id ?? null, payload: JSON.parse(JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) } });
  }

  async dispatch() {
    if (this.busy) return;
    this.busy = true;
    try {
      const events = await this.prisma.$transaction(async (tx) => {
        let rows: { id: bigint }[];
        if (this.skipLocked) {
          try {
            rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM outbox_events WHERE status = 'PENDING' AND available_at <= NOW(3) ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`;
          } catch (e) {
            if (String((e as Error).message).includes('SKIP LOCKED')) {
              this.skipLocked = false;
              rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM outbox_events WHERE status = 'PENDING' AND available_at <= NOW(3) ORDER BY id LIMIT 100 FOR UPDATE`;
            } else {
              throw e;
            }
          }
        } else {
          rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM outbox_events WHERE status = 'PENDING' AND available_at <= NOW(3) ORDER BY id LIMIT 100 FOR UPDATE`;
        }
        if (!rows.length) return [];
        const ids = rows.map((r) => r.id);
        const evs = await tx.outboxEvent.findMany({ where: { id: { in: ids } } });
        await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { status: 'DISPATCHED', dispatched_at: new Date() } });
        return evs;
      });
      for (const e of events) {
        const p = e.payload as Record<string, unknown>;
        try {
          if (e.event_type === 'notification.created') this.notifications.pushRealtime(p as never);
          else if (typeof p.facility === 'string') this.hub.toFacility(p.facility, { type: e.event_type, ...p });
          if (typeof p.user === 'string' && e.event_type !== 'notification.created') this.hub.toUser(p.user, { type: e.event_type, ...p });
          if (e.event_type === 'session.revoked' && typeof p.user === 'string') this.hub.revokeUser(p.user);
        } catch (err) {
          await this.prisma.outboxEvent.update({ where: { id: e.id }, data: { status: 'FAILED', attempts: { increment: 1 }, last_error: String((err as Error).message).slice(0, 500) } });
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
