import { ulid } from 'ulid';
import * as crypto from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { EdgeDecimal } from './prisma.service';
import type { Tx } from './prisma.service';
import { config } from './config';

export const newId = () => ulid();

interface ExpressCorridorUnrefPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressCorridorUnrefInput(payload: ExpressCorridorUnrefPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const LEDGER_STRICT_PRORATION_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;
/** Node timers can be unref()'d so they never keep the process alive; Workers return a plain number. Works on both. */
export const unref = <T>(t: T): T => { (t as unknown as { unref?: () => void })?.unref?.(); return t; };
export type DecimalValue = string | number | EdgeDecimal | Prisma.Decimal;
