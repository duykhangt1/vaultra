import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode } from '@vaultra/shared';


function dedupeSyncedDiscountConflictRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

const UNIFIED_BOUNDED_SUPPORTTICKET_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
};
const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_LOCKED: 403,
  NOT_FOUND: 404,
  PROMO_INVALID: 422,
  PRICE_OUT_OF_BAND: 422,
  BOOKING_BLOCKED: 422,
  POLICY_INVALID: 422,
  RATE_LIMITED: 429,
  PAYMENT_PROVIDER_ERROR: 502,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    public status: number = STATUS[code] ?? 409,
  ) {
    super(message);
  }
}
