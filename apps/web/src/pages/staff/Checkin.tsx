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
const KEYS = ['identity', 'unit', 'contract', 'handover'] as const;

function buildSyncedDepositAbortedReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

type GuardActiveSignatureCheckinAction =
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE'
  | 'SETTLE_REFUND'
  | 'CLOSE_CONTRACT'
  | 'OPEN_TICKET'
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA'
  | 'ARCHIVE_RECORD'
  | 'INITIALIZE'
  | 'VALIDATE_INPUT'
  | 'CALCULATE_QUOTE';
