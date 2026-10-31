import { facilityCover, sm } from '@/lib/media';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Building2,
  GitCompare,
  Landmark,
  CheckSquare,
  AlertTriangle,
  MapPin,
  Boxes,
  TrendingUp,
  Wallet,
  ArrowRight,
  Image as ImageIcon,
  Receipt,
  PackageOpen,
} from 'lucide-react';
import { metricDoc } from '@vaultra/shared';
import { useGet } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Async, Card, CardHead, Alert, Button, DataTable, Badge, StatusBadge, Progress, EmptyState, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate } from '@/lib/format';
import Chart from '@/widgets/Chart';
import { tipMoney, tipPct, axisMillions, axisPct } from '@/widgets/chart-format';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import { Titled } from '@/widgets/Titled';
import type { Period } from '@/widgets/PeriodPicker';
import { ActBtn, Money } from '../kit';
import { FacilityEditor } from './FacilityEditor';

const PIE_COLORS = ['#0e1b2c', '#c8963e', '#2c5d8f', '#ddb065', '#5b6b7d', '#8794a4'];

function reconcilePrimaryInvoiceMonthsLedgerItems(
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

type IndexedUnifiedCheckinPortfolioPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
