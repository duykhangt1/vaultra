import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, sha256 } from '../common/util';
import { StorageService } from './storage.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


function mapToCoreAuditTrailRawPurposeSummary(source: {
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

const MONTHLY_WORKFORCE_SNIFF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyWorkforceSniffTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_WORKFORCE_SNIFF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}
type CoreRollingProrationMediaTag = 'flow3' | 'active' | 'settled';
type Purpose = Prisma.MediaFileCreateInput['purpose'];

const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
