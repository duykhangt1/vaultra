import { Injectable } from './nestjs';
import { config } from './config';
import { hmac, safeEqual } from '../../../api/src/common/util';


interface SyncedHandoverPresignGetBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSyncedHandoverPresignGetByScope(items: readonly SyncedHandoverPresignGetBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const UNIFIED_PORTAL_RENEWAL_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
};
type Bucket = 'PUBLIC' | 'PRIVATE';
type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number; httpMetadata?: { contentType?: string } } | null>;
  head?(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete?(key: string): Promise<unknown>;
};
