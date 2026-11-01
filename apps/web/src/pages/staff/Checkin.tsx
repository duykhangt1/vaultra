import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Mail, KeyRound, RefreshCw, ExternalLink } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Async, Card, PageHeader, Button, Alert, Field, Input, Select, Stepper, Badge, Menu, StatusBadge, Textarea } from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Info, PhotoGallery } from '../kit';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';
import { ContractInspectionsCard } from '../app/Contracts';

const STEPS = ['1. Rà soát thông tin', '2. Gán mã kho & Đổi kho', '3. Ký hợp đồng (Email)', '4. Bàn giao & Cấp mã PIN'];

interface BoundedHandoverRefreshPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedHandoverRefreshInput(payload: BoundedHandoverRefreshPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const BOUNDED_INDEXED_SIGNATURE_COLUMNS = [
  'depositHeldVnd',
] as const;
const KEYS = ['identity', 'unit', 'contract', 'handover'] as const;
