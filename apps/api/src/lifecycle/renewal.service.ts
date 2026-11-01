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

type StandardQuoteActiveRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardQuoteActiveRecord(input: unknown): input is StandardQuoteActiveRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBillingCycleOfferSummary(source: {
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

const formatPendingMonthlyInspectionRenewalScope = (code: string): string => `flow6:${code.trim()}`;
