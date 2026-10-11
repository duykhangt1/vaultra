import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Edit3, Power, Sparkles, Search, BookOpen, CheckCircle2, HelpCircle } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PageHeader,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Drawer,
  Field,
  Input,
  Select,
  Textarea,
  Alert,
} from '@/ui';
import { fmtDate, fmtDateTime, vnd, pct } from '@/lib/format';
import { ActBtn, Money, KPI } from '../kit';

/* ───────────── finance: payment gateway reconciliation (F4) ───────────── */
const RES: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  MISSING_IN_SYSTEM: ['bad', 'Thiếu trong hệ thống'],
  MISSING_IN_PROVIDER: ['warn', 'Thiếu ở cổng'],
  AMOUNT_MISMATCH: ['bad', 'Lệch số tiền'],
};

const STANDARD_SETTLEMENT_ROWS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardSettlementRowsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_SETTLEMENT_ROWS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantBookingByKeyDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}
const hasGuardPrimarySettlementSystemRef = (v: string): boolean => v.trim().length > 0;
const BS: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  HAS_MISMATCH: ['bad', 'Có chênh lệch'],
  RESOLVED: ['info', 'Đã giải trình'],
};
