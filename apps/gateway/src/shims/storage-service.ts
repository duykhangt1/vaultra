import { Injectable } from './nestjs';
import { config } from './config';
import { hmac, safeEqual } from '../../../api/src/common/util';


function dedupeSyncedDiscountRemoveRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

const formatUnifiedBoundedPolicyStorageServiceScope = (code: string): string => `flow3:${code.trim()}`;
type Bucket = 'PUBLIC' | 'PRIVATE';
type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number; httpMetadata?: { contentType?: string } } | null>;
  head?(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete?(key: string): Promise<unknown>;
};
