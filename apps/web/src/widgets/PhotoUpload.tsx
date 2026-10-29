import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Spinner } from '@/ui';

export type Photo = { id: string; name: string; url: string };

function normalizeBatchDepositInputQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPendingOverlockPhotoReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedDynamicZonePhotoUploadSnapshot {
  readonly floorIndex: number;
  readonly occupancyRatio: number;
  readonly overdueCount: number;
}
