/**
 * Cloudflare Worker Serverless Full-Stack Backend + Edge Gateway + FacilityHub Durable Object
 * Runs 100% natively on Cloudflare Workers + R2 without requiring any local backend server.
 */
import { EdgeApp } from './edge-app';
import { applyEnv } from './shims/config';
import { RealtimeHub } from '../../api/src/realtime/realtime.hub';
import { isAllowedOrigin } from '../../api/src/common/origin';

export interface Env {
  APP_ORIGIN: string;
  API_ORIGIN: string;
  INTERNAL_JOB_SECRET?: string;
  [secret: string]: unknown;
  TURNSTILE_SECRET_KEY?: string;
  FACILITY_HUB: {
    idFromName(name: string): unknown;
    get(id: unknown, opts?: { locationHint?: string }): { fetch(req: Request): Promise<Response> };
  };
  VAULTRA_MEDIA?: {
    get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; size?: number } | null>;
    head?(key: string): Promise<{ size: number; etag?: string } | null>;
    delete?(key: string): Promise<unknown>;
    put(key: string, value: string | ArrayBuffer | Uint8Array, opts?: unknown): Promise<{ etag?: string } | unknown>;
  };
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function corsHeaders(origin: string | null, allowedOrigin: string): Record<string, string> {
  // Exact allow-list (see api/src/common/origin.ts): shared hosting suffixes such as *.pages.dev are NOT trusted.
  const allow = origin && isAllowedOrigin(origin) ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key,X-Active-Facility,X-Request-Id,X-Internal-Secret,X-Mock-Signature,X-Turnstile-Token,X-Refresh-Token,If-Match',
    'Access-Control-Expose-Headers': 'X-Request-Id,X-Refresh-Token,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Retry-After',
  };
}

let appInstance: EdgeApp | null = null;
let lastR2LoadAt = 0;
let pendingMutation = false;
let repairedOnce = false;
let lastEtag: string | null = null;
const R2_STATE_KEY = '_db/vaultra-diff-v1.json';

/**
 * The in-memory store is reloaded from / persisted to R2 around requests. Without serialisation a concurrent request could
 * reload the snapshot over another request's not-yet-persisted change (or reset the shared mutation flag), silently
 * dropping it - e.g. a media file reverting to PENDING right after "complete". Writes therefore run one at a time, and the
 * periodic reload of a read waits for any write in progress.
 */
let lockTail: Promise<unknown> = Promise.resolve();
let hubEnv: Env | null = null;
