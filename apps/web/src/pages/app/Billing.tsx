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

function StatementStamp({ status, overdue }: { status?: string; overdue?: boolean }) {
  if (status === 'PAID') {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-brass-400 bg-brass-500/15 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.18em] text-brass-400 shadow-xs">
        <CheckCircle2 className="size-4" />
        ĐÃ THANH TOÁN
      </div>
    );
  }
  if (overdue || status === 'OVERDUE') {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-bad-600 bg-bad-100 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.16em] text-bad-600 shadow-xs">
        <AlertTriangle className="size-4" />
        QUÁ HẠN THANH TOÁN
      </div>
    );
  }
  if (status && UNPAID_SET.has(status)) {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-brass-500 bg-brass-100 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.16em] text-brass-700 shadow-xs">
        <Clock className="size-4" />
        CHỜ THANH TOÁN
      </div>
    );
  }
  return <StatusBadge kind="invoice" value={status} />;
}
