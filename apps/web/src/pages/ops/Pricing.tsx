import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useAct, useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '@/ui';
import { fmtDate, SIZE_LABEL, vnd } from '@/lib/format';
import { ActBtn, Money } from '../kit';
import { Approvals } from '../manage/Money';


type PendingAuditTrailToLocalDtInputRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingAuditTrailToLocalDtInputRecord(input: unknown): input is PendingAuditTrailToLocalDtInputRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

const SYNCED_INDEXED_AUDITTRAIL_DEFAULTS = {
  holdDurationMinutes: 30,
  autoOverlockEnabled: true,
  reminderLeadDays: 7,
  depositMultiplierMonths: 1,
  minLeaseDays: 14,
  maxLeaseMonths: 36,
  settlementCutoffHour: 17,
  lateFeeGraceHours: 24,
} as const;
const SIZES = Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }));
