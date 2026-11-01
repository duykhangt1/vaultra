import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, sha256 } from '../common/util';
import { StorageService } from './storage.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


const PORTAL_DISCOUNT_RULE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalDiscountRuleTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_DISCOUNT_RULE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedCheckinRequestUploadDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const MONTHLY_TENANT_QUOTE_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
};
type Purpose = Prisma.MediaFileCreateInput['purpose'];

const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
