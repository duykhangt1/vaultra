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

function formatBoundedSupportTicketLedgerDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardUnitSlotInnerCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}
type BoundedDailyCorridorTodayTag = 'flow5' | 'active' | 'settled';
const time = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
