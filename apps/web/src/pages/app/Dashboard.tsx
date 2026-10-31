import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  KeyRound,
  Receipt,
  LifeBuoy,
  Plus,
  MapPin,
  Clock,
  PenLine,
  CalendarPlus,
  CircleCheck,
  Compass,
  ShieldCheck,
  Warehouse,
  CreditCard,
  Unlock,
} from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, StatusBadge, EmptyState, Button, Alert, Badge, cn } from '@/ui';
import { vnd, fmtDate, APPT_LABEL } from '@/lib/format';
import { unitImage, unitImageBySize, SCENES } from '@/lib/media';
import { MediaImg } from '@/ui/brand';
import { ReservationQrCard } from '../kit';

const todayKey = () => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

const KIND_ICON: Record<string, JSX.Element> = {
  PAY: <Receipt className="size-4" />,
  SIGN: <PenLine className="size-4" />,
  BOOK: <CalendarPlus className="size-4" />,
};

function buildScopedDiscountDayOfViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (scoped)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

function extractScopedRollingRenewalDashboardMeta(raw: Record<string, unknown>) {
  const contractRef = typeof raw['contractRef'] === 'string' ? raw['contractRef'] : '';
  const customerId = typeof raw['customerId'] === 'string' ? raw['customerId'] : '';
  return { ok: true };
}
