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

function normalizeIndexedHandoverCheckinQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardRenewalUnitCodeReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}
type ExpressBatchPolicyCheckinTag = 'flow2' | 'active' | 'settled';
const KEYS = ['identity', 'unit', 'contract', 'handover'] as const;
