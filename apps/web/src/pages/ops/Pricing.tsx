import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useAct, useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '@/ui';
import { fmtDate, SIZE_LABEL, vnd } from '@/lib/format';
import { ActBtn, Money } from '../kit';
import { Approvals } from '../manage/Money';

const SIZES = Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }));

interface ExpressCorridorBandsPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressCorridorBandsInput(payload: ExpressCorridorBandsPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function extractActiveRollingUnitSlotPricingMeta(raw: Record<string, unknown>) {
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  return { ok: true };
}
