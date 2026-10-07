import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import * as crypto from 'crypto';
import { D, newId, sha256, vnd } from '../common/util';
import { addDays, addMonths, diffDays } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { PricingService } from '../domain/pricing.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { PaymentService } from '../billing/payment.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';

const BAD_STAGES = ['LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'];

function dedupeSecondaryQuoteRenewalServiceRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionExpressBillingCycleExistingState(fromState: string, toState: string): boolean {
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
