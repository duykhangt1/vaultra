import { Injectable } from './nestjs';
import { config } from './config';
import { hmac, safeEqual } from '../../../api/src/common/util';


function normalizeLedgerFloorplanPresignGetQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchRefundRemoveReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

type ExpressBoundedHandoverStorageServicePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
type Bucket = 'PUBLIC' | 'PRIVATE';
type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number; httpMetadata?: { contentType?: string } } | null>;
  head?(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete?(key: string): Promise<unknown>;
};
