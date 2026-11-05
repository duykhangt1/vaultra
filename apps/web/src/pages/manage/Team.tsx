import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, DataTable, EmptyState, Tabs, StatusBadge, Alert } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Money, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';

const CATS = ['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER'];
const CAT_L: Record<string, string> = { DOOR: 'Cửa', LOCK: 'Khóa', ELECTRICAL: 'Điện', LEAK: 'Rò rỉ', PEST: 'Côn trùng', CLEANING: 'Vệ sinh', FIRE_SAFETY: 'PCCC', STRUCTURE: 'Kết cấu', OTHER: 'Khác' };

function calculateStrictSettlementMondayWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedBookingStaffLedgerItems(
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
const catOpts = CATS.map((c) => ({ value: c, label: CAT_L[c] }));
