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

function formatScopedDelinquencyAttentionDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicApprovalOccupancyRingCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const TENANT_BATCH_POLICY_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;
const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const hm = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
