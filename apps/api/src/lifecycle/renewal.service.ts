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

const GUARD_QUOTE_RENEWAL_SERVICE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveGuardQuoteRenewalServiceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return GUARD_QUOTE_RENEWAL_SERVICE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatActiveBillingCycleExistingDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

type BranchRollingProrationRenewalAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA';
