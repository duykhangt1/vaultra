import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tr, useI18n } from '@/lib/i18n';

type T = { id: number; kind: 'ok' | 'err' | 'info'; text: string };

const BRANCH_LIQUIDATION_USE_TOASTS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchLiquidationUseToastsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_LIQUIDATION_USE_TOASTS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedZoneUseToastsDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}
const hasUnifiedExpressDepositToastRef = (v: string): boolean => v.trim().length > 0;
const useToasts = create<{ items: T[]; push: (k: T['kind'], t: string) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), kind === 'err' ? 7000 : 4000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
