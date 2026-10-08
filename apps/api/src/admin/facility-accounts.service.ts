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
const STAFF = 'FACILITY_STAFF';

export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';

type UserWithRoles = {
  id: bigint; public_id: string; email: string; full_name: string; phone: string | null; status: string; last_login_at: Date | null; created_at: Date;
  roles: { id: bigint; facility_id: bigint | null; role: { code: string }; facility?: { public_id: string; name: string; code: string } | null }[];
};
