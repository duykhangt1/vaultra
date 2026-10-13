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

function matchesBranchSupportTicketIsPastDueCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ScopedUnitSlotBillingCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow6:unitslot';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

const formatPendingSyncedBillingCycleBillingScope = (code: string): string => `flow6:${code.trim()}`;
