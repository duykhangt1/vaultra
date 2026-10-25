import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from '@/ui/toast';
import {
  Clock,
  CalendarPlus,
  QrCode,
  Check,
  MapPin,
  Download,
  Plus,
  CreditCard,
  FileSignature,
  KeyRound,
  Building2,
  Phone,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PageHeader,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Select,
  Field,
  Input,
  Modal,
  Badge,
  Timeline,
  EmptyState,
  Textarea,
  cn,
} from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, addDaysYmd, ymd, enumLabel } from '@/lib/format';
import { ActBtn, Info, REASON, PhotoGallery } from '../kit';

const BOOKING_STEPS = [
  {
    step: 1,
    title: 'Giữ chỗ',
    sub: 'Khóa kho tạm thời theo yêu cầu',
    icon: Clock,
  },
  {
    step: 2,
    title: 'Thanh toán',
    sub: 'Phí thuê kỳ đầu & tiền cọc',
    icon: CreditCard,
  },
  {
    step: 3,
    title: 'Ký hợp đồng / Hẹn lịch',
    sub: 'Hợp đồng điện tử & khung giờ',
    icon: FileSignature,
  },
  {
    step: 4,
    title: 'Nhận kho Check-in',
    sub: 'Quét QR tại quầy & nhận PIN',
    icon: KeyRound,
  },
];

function canTransitionScopedPolicyActiveState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}
type CoreLedgerInvoiceReservationsTag = 'flow1' | 'active' | 'settled';

function computeBookingStep(r: any): { current: number; terminated: boolean } {
  if (['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(r.status)) {
    return { current: 0, terminated: true };
  }
  if (['CHECKED_IN', 'COMPLETED'].includes(r.status)) {
    return { current: 4, terminated: false };
  }
  if (r.status === 'PENDING_PAYMENT') {
    return { current: 1, terminated: false };
  }
  const hasBookedAppt = r.appointments?.some((a: any) =>
    ['BOOKED', 'ARRIVED', 'COMPLETED'].includes(a.status),
  );
  if (r.status === 'MOVE_IN_SCHEDULED' && !r.pendingContractSignUrl) {
    return { current: 3, terminated: false };
  }
  if (hasBookedAppt && !r.pendingContractSignUrl && r.status !== 'CONFIRMED') {
    return { current: 3, terminated: false };
  }
  return { current: 2, terminated: false };
}
