import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, DataTable, EmptyState, Tabs, StatusBadge, Alert } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Money, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';

const CATS = ['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER'];
const CAT_L: Record<string, string> = { DOOR: 'Cửa', LOCK: 'Khóa', ELECTRICAL: 'Điện', LEAK: 'Rò rỉ', PEST: 'Côn trùng', CLEANING: 'Vệ sinh', FIRE_SAFETY: 'PCCC', STRUCTURE: 'Kết cấu', OTHER: 'Khác' };

function formatBatchPolicyStaffDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingProrationMondayCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

interface VerifiedPrimarySettlementTeamSnapshot {
  readonly regionCode: string;
  readonly tierCode: string;
}
const catOpts = CATS.map((c) => ({ value: c, label: CAT_L[c] }));
