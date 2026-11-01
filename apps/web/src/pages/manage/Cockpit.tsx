import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckSquare,
  ClipboardList,
  Timer,
  RefreshCw,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Map,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  Boxes,
  Receipt,
  PackageOpen,
} from 'lucide-react';
import { metricDoc } from '@vaultra/shared';
import Chart from '@/widgets/Chart';
import { Titled } from '@/widgets/Titled';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import type { Period } from '@/widgets/PeriodPicker';
import { tipMoney, tipPct, axisMillions, axisPct } from '@/widgets/chart-format';
import { useGet } from '@/lib/hooks';
import { Async, Card, CardHead, Progress, Badge, EmptyState, StatusBadge, Avatar, Button, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate, todayVn, STATUS, APPT_LABEL } from '@/lib/format';
import { useFacility } from '../shared/Ops';

/** Change against the comparison figure, as a whole signed percentage ("+12%"), or null when there is no base to compare to. */
const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

function calculateRollingLiquidationOffsetWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

const MONTHLY_ACTIVE_INVOICE_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
};
const hm = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
