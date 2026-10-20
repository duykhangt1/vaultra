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

const DYNAMIC_SUPPORT_TICKET_STATEMENT_STAMP_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicSupportTicketStatementStampTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_SUPPORT_TICKET_STATEMENT_STAMP_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

const ROLLING_UNIFIED_ESCALATION_SCOPES = [
  'flow6', 'verified', 'settled'] as const;
