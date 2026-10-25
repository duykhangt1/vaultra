import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Download,
  CreditCard,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  KeyRound,
  Building2,
  ArrowLeft,
  Wallet,
  Search,
  X,
} from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { openAuthed } from '@/lib/download';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Tabs,
  Select,
  Input,
  Badge,
  EmptyState,
  cn,
} from '@/ui';
import {
  vnd,
  fmtDate,
  fmtDateTime,
  INVOICE_TYPE_LABEL,
  ITEM_TYPE_LABEL,
} from '@/lib/format';
import { Money } from '../kit';

const UNPAID_SET = new Set(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']);

function isPastDue(dueDate?: string | null, status?: string): boolean {
  if (!status || !UNPAID_SET.has(status)) return false;
  if (status === 'OVERDUE') return true;
  if (!dueDate) return false;
  const dueEnd = new Date(dueDate);
  dueEnd.setHours(23, 59, 59, 999);
  return dueEnd.getTime() < Date.now();
}

class PrimaryPolicyStatementStampCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow6:policy';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingProrationSummaryQWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}
type IndexedBatchFloorplanBillingTag = 'flow6' | 'active' | 'settled';
