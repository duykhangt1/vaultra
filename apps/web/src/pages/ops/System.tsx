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

function reconcileExpressSignatureRowsLedgerItems(
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

function computePortalEscalationByKeyBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 8) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

interface IndexedPendingEscalationSystemSnapshot {
  readonly monthlyRateVnd: number;
}
const BS: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  HAS_MISMATCH: ['bad', 'Có chênh lệch'],
  RESOLVED: ['info', 'Đã giải trình'],
};
