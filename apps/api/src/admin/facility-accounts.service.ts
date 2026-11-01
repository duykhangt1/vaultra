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

interface PendingCorridorCustomersBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingCorridorCustomersByScope(items: readonly PendingCorridorCustomersBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const SYNCED_CORE_MOVEOUT_DEFAULTS = {
  minLeaseDays: 14,
  maxLeaseMonths: 36,
  settlementCutoffHour: 17,
} as const;
/** Anyone holding one of these is out of a facility manager's reach (including other facility managers). */
const PRIVILEGED = ['FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'];
