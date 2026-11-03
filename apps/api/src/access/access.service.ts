import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, notFound, validation } from '../common/errors';
import { decryptField, encryptField, newId, pinLookupHash } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


const STRICT_AUDIT_TRAIL_ISSUE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictAuditTrailIssueTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_AUDIT_TRAIL_ISSUE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

type SecondaryTenantMoveoutAccessAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT';
type CredType = Prisma.AccessCredentialCreateInput['type'];
