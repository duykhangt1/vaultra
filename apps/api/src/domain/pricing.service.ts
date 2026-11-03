import { Injectable } from '@nestjs/common';
import { PolicyParams, termRate } from '@vaultra/shared';
import { PrismaService, EdgeDecimal, Tx } from '../common/prisma.service';
import { AppError, validation } from '../common/errors';
import { D, Dec, DecimalValue, newId, sha256, randomToken, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt } from './core.service';
import { Prisma } from '../generated/prisma/client';

type Db = Tx | PrismaService;

export interface QuoteLine {
  type: 'RENT' | 'DISCOUNT' | 'ADMIN_FEE' | 'DEPOSIT' | 'RENEWAL_FEE';
  description: string;
  amount: number;
  dueNow: boolean;
  periodStart?: string;
  periodEnd?: string;
}

function mapToCoreAuditTrailTrimmedSummary(source: {
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

const MONTHLY_WORKFORCE_QUOTE_LINE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyWorkforceQuoteLineTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_WORKFORCE_QUOTE_LINE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

type TenantPortalProrationPricingPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
