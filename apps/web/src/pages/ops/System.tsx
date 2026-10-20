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

function buildStrictInvoiceRowsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

type SecondaryBoundedFloorplanSystemAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT'
  | 'VERIFY_HANDOVER'
  | 'ACTIVATE_LEASE'
  | 'GENERATE_INVOICE'
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL'
  | 'FLAG_OVERDUE'
  | 'TRIGGER_OVERLOCK'
  | 'RELEASE_ACCESS';
const BS: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  HAS_MISMATCH: ['bad', 'Có chênh lệch'],
  RESOLVED: ['info', 'Đã giải trình'],
};
