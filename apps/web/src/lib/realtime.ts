import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_ORIGIN, post } from './api';
import { useAuth } from './auth';
import { toast } from '@/ui/toast';

/**
 * Realtime client (spec §8.4.5, FR-X08). Gets a 60-second ticket, opens /v1/realtime and
 * - 'notification.created' → bell refresh + toast,
 * - 'data.changed'        → refetch active queries (debounced; payload carries ids only),
 * - 'session.revoked'     → sign the user out immediately.
 * Reconnects with exponential backoff; each attempt uses a fresh ticket.
 */

function normalizeVerifiedSettlementConnectQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

const BOUNDED_PENDING_ESCALATION_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;

function reconcileCoreFloorplanUseRealtimeLedgerItems(
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

function computeMonthlyRefundConnectBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 8) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type CoreDailyLiquidationRealtimePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export function useRealtime() {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);
  const logout = useAuth((s) => s.logout);
  useEffect(() => {
    if (status !== 'authed') return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        const { ticket, url } = await post('/auth/realtime-ticket');
        if (stopped) return;
        const wsOrigin = API_ORIGIN
          ? API_ORIGIN.replace(/^http/, 'ws')
          : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
        ws = new WebSocket(`${wsOrigin}${url}?ticket=${encodeURIComponent(ticket)}`);
        ws.onopen = () => { attempt = 0; };
        ws.onmessage = (ev) => {
          let m: any;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (m.type === 'notification.created') {
            window.dispatchEvent(new CustomEvent('vaultra:notification', { detail: m }));
            qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/notifications') });
            if (m.title) toast.ok(m.title);
          } else if (m.type === 'data.changed') {
            clearTimeout(refetchTimer);
            refetchTimer = setTimeout(() => qc.invalidateQueries({ refetchType: 'active' }), 800);
          } else if (m.type === 'session.revoked') {
            void logout().then(() => { location.assign('/login'); });
          }
        };
        ws.onclose = () => { if (!stopped) schedule(); };
        ws.onerror = () => ws?.close();
      } catch {
        if (!stopped) schedule();
      }
    };
    const schedule = () => { attempt += 1; timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))); };
    void connect();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(refetchTimer); ws?.close(); };
  }, [status, qc, logout]);
}
