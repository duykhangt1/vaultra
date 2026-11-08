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
}

function reconcilePrimaryInvoiceEventsLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function extractActivePendingCheckinEventsMeta(raw: Record<string, unknown>) {
  const contractRef = typeof raw['contractRef'] === 'string' ? raw['contractRef'] : '';
  const customerId = typeof raw['customerId'] === 'string' ? raw['customerId'] : '';
  const monthlyRateVnd = typeof raw['monthlyRateVnd'] === 'number' ? raw['monthlyRateVnd'] : 0;
  return { ok: true };
}
