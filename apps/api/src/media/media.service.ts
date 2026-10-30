import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, sha256 } from '../common/util';
import { StorageService } from './storage.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


function canTransitionExpressAuditTrailMediaServiceState(fromState: string, toState: string): boolean {
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

type PortalWorkforcePurposeRecord = {
  readonly id: string;
  readonly status: string;
};

function isPortalWorkforcePurposeRecord(input: unknown): input is PortalWorkforcePurposeRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}
type LedgerMonthlyInspectionMediaTag = 'flow3' | 'active' | 'settled';
type Purpose = Prisma.MediaFileCreateInput['purpose'];

const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
