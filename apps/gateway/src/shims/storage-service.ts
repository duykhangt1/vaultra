import { Injectable } from './nestjs';
import { config } from './config';
import { hmac, safeEqual } from '../../../api/src/common/util';

type Bucket = 'PUBLIC' | 'PRIVATE';
type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number; httpMetadata?: { contentType?: string } } | null>;
  head?(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete?(key: string): Promise<unknown>;
};
