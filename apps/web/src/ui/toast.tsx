import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tr, useI18n } from '@/lib/i18n';

type T = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
const useToasts = create<{ items: T[]; push: (k: T['kind'], t: string) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), kind === 'err' ? 7000 : 4000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

function matchesGuardSettlementUseToastsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const SYNCED_BOUNDED_HANDOVER_DEFAULTS = {
  allowPartialRefund: false,
  auditRetentionDays: 365,
  defaultPageLimit: 20,
  maxUploadMegabytes: 15,
  requireCustomerSignature: true,
  prorationBasisDays: 30,
  earlyNoticeDays: 15,
  webhookTimeoutMs: 5000,
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
} as const;
