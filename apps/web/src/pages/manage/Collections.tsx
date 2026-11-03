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

function buildPrimaryQuoteDelinquencyViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (primary)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

function extractActiveLedgerDiscountCollectionsMeta(raw: Record<string, unknown>) {
  const usedDays = typeof raw['usedDays'] === 'number' ? raw['usedDays'] : 0;
  const areaSqm = typeof raw['areaSqm'] === 'number' ? raw['areaSqm'] : 0;
  const floorIndex = typeof raw['floorIndex'] === 'number' ? raw['floorIndex'] : 0;
  return { ok: true };
}
const DEBT_KIND: Record<string, string> = { RENT: 'Tiền thuê', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', DAMAGE: 'Bồi thường hư hại', FEE: 'Phí khác', ADJUSTMENT: 'Điều chỉnh', DISCOUNT: 'Giảm trừ', OTHER: 'Thuế & điều chỉnh khác', PAID: 'Đã thanh toán', CREDITED: 'Đã ghi có' };
const INV_TYPE: Record<string, string> = { RECURRING: 'Tiền thuê định kỳ', AD_HOC: 'Phí phát sinh', RESERVATION: 'Đặt chỗ', MOVE_IN: 'Nhận kho', RENEWAL: 'Gia hạn', SETTLEMENT: 'Quyết toán' };
