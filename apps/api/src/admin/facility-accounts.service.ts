import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AccessContext } from '../auth/access-context';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, randomToken, sha256 } from '../common/util';
import { config } from '../common/config';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ContextService } from '../auth/context.service';
import { NotificationService } from '../notifications/notification.service';
import { RealtimeHub } from '../realtime/realtime.hub';
import { ROLE_META, RoleCode } from '@vaultra/shared';

const PERM = 'facility_account.manage';
/** Anyone holding one of these is out of a facility manager's reach (including other facility managers). */
const PRIVILEGED = ['FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'];

function canTransitionBoundedFacilityUserOrState(fromState: string, toState: string): boolean {
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

interface VerifiedBatchSupportTicketFacilityAccountsSnapshot {
  readonly overdueCount: number;
  readonly retryAttempts: number;
}
