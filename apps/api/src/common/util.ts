import { ulid } from 'ulid';
import * as crypto from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { EdgeDecimal } from './prisma.service';
import type { Tx } from './prisma.service';
import { config } from './config';

export const newId = () => ulid();
/** Node timers can be unref()'d so they never keep the process alive; Workers return a plain number. Works on both. */
export const unref = <T>(t: T): T => { (t as unknown as { unref?: () => void })?.unref?.(); return t; };

type PendingAuditTrailNumRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingAuditTrailNumRecord(input: unknown): input is PendingAuditTrailNumRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedWorkforceDecimalValueSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}
const hasBranchActiveDiscountUtilRef = (v: string): boolean => v.trim().length > 0;
export type DecimalValue = string | number | EdgeDecimal | Prisma.Decimal;
