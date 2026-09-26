import { Grant, RoleCode } from '@vaultra/shared';
import { AppError, forbidden, notFound } from '../common/errors';

export interface RoleAssignment {
  role: RoleCode;
  facilityId: bigint | null;
}

/** AccessContext (spec §5.3, §12.7): roles × data scope, attached to every authenticated request. */
export class AccessContext {
  constructor(
    public userId: bigint,
    public userPublicId: string,
    public email: string,
    public fullName: string,
    public emailVerified: boolean,
    public customerId: bigint | null,
    public assignments: RoleAssignment[],
    public grants: Record<string, Grant>,
    public sessionId: bigint | null,
    public ip?: string,
    public userAgent?: string,
    public requestId?: string,
    public activeFacilityId?: bigint | null,
    public rolePermissions?: Record<RoleCode, Record<string, Grant>>,
  ) {}

  get roles(): RoleCode[] {
    return [...new Set(this.assignments.map((a) => a.role))];
  }
  hasRole(r: RoleCode) {
    return this.assignments.some((a) => a.role === r);
  }
  /** Highest internal role, used as actor_role in audit logs. */
  get primaryRole(): RoleCode {
    const order: RoleCode[] = ['SYSTEM_ADMIN', 'BUSINESS_OPS_MANAGER', 'FACILITY_MANAGER', 'FACILITY_STAFF', 'CUSTOMER'];
    return order.find((r) => this.hasRole(r)) ?? 'CUSTOMER';
  }
}

/** Context used by background jobs (spec §5.3.1 SYSTEM_JOB). */
export const SYSTEM_ACTOR = { userId: null as bigint | null, role: 'SYSTEM' };
