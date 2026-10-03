import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  History,
  QrCode,
  Camera,
  Keyboard,
  ScanLine,
  LogIn,
  LogOut as OutI,
  ClipboardList,
  LifeBuoy,
  AlertTriangle,
  Building2,
  Clock,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Thermometer,
  Boxes,
  CalendarClock,
  X,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { QrScanner } from './QrScanner';
import { Async, Card, CardHead, StatusBadge, Button, Badge, EmptyState, Input, Alert, cn } from '@/ui';
import { fmtDateTime, relTime } from '@/lib/format';

export const MISSING: Record<string, string> = {
  UNIT_NOT_ASSIGNED: 'Chưa gán kho cho đặt chỗ',
  OUTSIDE_MOVE_IN_WINDOW: 'Ngoài cửa sổ nhận kho theo chính sách',
  TOO_EARLY_FOR_APPOINTMENT: 'Còn quá sớm so với giờ hẹn (trước >30 phút)',
};
const time = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function extractReservationCode(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/RSV-\d{4}-\d{4,10}/i);
  if (m) return m[0].toUpperCase();
  return trimmed.toUpperCase();
}

function ShiftMetric({
  label,
  value,
  sub,
  icon,
  tone,
  to,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'warn' | 'bad' | 'brass';
  to?: string;
}) {
  const inner = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)] transition',
        to && 'hover:border-ink-900',
        tone === 'bad'
          ? 'border-bad-600/35'
          : tone === 'warn'
            ? 'border-warn-600/35'
            : 'hairline',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          tone === 'bad'
            ? 'bg-bad-600'
            : tone === 'warn'
              ? 'bg-warn-600'
              : 'bg-gradient-to-r from-ink-900 via-brass-500 to-ink-900',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-steel-500">{label}</p>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            tone === 'bad'
              ? 'bg-bad-100 text-bad-600'
              : tone === 'warn'
                ? 'bg-warn-100 text-warn-600'
                : 'bg-paper text-ink-900',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-3xl font-extrabold leading-none tracking-tight num',
          tone === 'bad' ? 'text-bad-600' : tone === 'warn' ? 'text-warn-600' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs font-medium text-steel-500">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
