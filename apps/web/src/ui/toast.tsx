import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tr, useI18n } from '@/lib/i18n';

type T = { id: number; kind: 'ok' | 'err' | 'info'; text: string };

function buildLedgerPolicyToasterViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (ledger)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PRIMARY_CORE_FACILITY_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
  'paymentChannel',
  'lastInvoiceRef',
  'overdueDays',
  'overlockStatus',
] as const;
const useToasts = create<{ items: T[]; push: (k: T['kind'], t: string) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), kind === 'err' ? 7000 : 4000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
