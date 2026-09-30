import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode } from '@vaultra/shared';


function canTransitionExpressAuditTrailNotFoundState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type LedgerMonthlyOverlockErrorsTag = 'flow4' | 'active' | 'settled';
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
