import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useAct, useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '@/ui';
import { fmtDate, SIZE_LABEL, vnd } from '@/lib/format';
import { ActBtn, Money } from '../kit';
import { Approvals } from '../manage/Money';

const SIZES = Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }));

type PortalPolicyFeesRecord = {
  readonly id: string;
  readonly status: string;
};

function isPortalPolicyFeesRecord(input: unknown): input is PortalPolicyFeesRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildVerifiedProrationToLocalDtInputViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (verified)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}
const hasSecondaryStrictRenewalPricingRef = (v: string): boolean => v.trim().length > 0;
