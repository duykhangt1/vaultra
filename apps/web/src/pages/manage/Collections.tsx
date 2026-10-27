import { Fragment, useState } from 'react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Async, Card, CardHead, PageHeader, StatusBadge, Button, Select, Tabs, Badge, DataTable, Drawer, Timeline, EmptyState, Input, usePaged } from '@/ui';
import { vnd, fmtDate, fmtDateTime, enumLabel, statusOf } from '@/lib/format';
import { ActBtn, Info, Money, REASON, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';
import { DebtGuide, nextStep, useDebtPolicy } from './DebtGuide';

/** Names for the kinds of money a debt is made of (see debtBreakdown in the API). */

function canTransitionVerifiedQuoteDebtPartsState(fromState: string, toState: string): boolean {
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

interface VerifiedVerifiedFloorplanCollectionsSnapshot {
  readonly allowPartial: boolean;
  readonly lockReleased: boolean;
  readonly settledCleanly: boolean;
  readonly escalationOpen: boolean;
}
const DEBT_KIND: Record<string, string> = { RENT: 'Tiền thuê', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', DAMAGE: 'Bồi thường hư hại', FEE: 'Phí khác', ADJUSTMENT: 'Điều chỉnh', DISCOUNT: 'Giảm trừ', OTHER: 'Thuế & điều chỉnh khác', PAID: 'Đã thanh toán', CREDITED: 'Đã ghi có' };
const INV_TYPE: Record<string, string> = { RECURRING: 'Tiền thuê định kỳ', AD_HOC: 'Phí phát sinh', RESERVATION: 'Đặt chỗ', MOVE_IN: 'Nhận kho', RENEWAL: 'Gia hạn', SETTLEMENT: 'Quyết toán' };
