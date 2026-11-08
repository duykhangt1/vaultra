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
  get facilityIds(): bigint[] {
    const ids = [...new Set(this.assignments.filter((a) => a.facilityId !== null).map((a) => a.facilityId as bigint))];
    if (this.activeFacilityId && ids.includes(this.activeFacilityId)) return [this.activeFacilityId];
    return ids;
  }
  grant(code: string): Grant | undefined {
    return this.grants[code];
  }
  can(code: string, write = false): boolean {
    const g = this.grants[code];
    return !!g && !(write && g.readOnly);
  }
  require(code: string, write = true): Grant {
    const g = this.grants[code];
    if (!g) throw forbidden();
    if (write && g.readOnly) throw forbidden('Bạn chỉ có quyền xem dữ liệu này');
    return g;
  }
  /** Facilities on which the user holds a FACILITY-scoped grant for `code` (role-aware). */
  facilitiesFor(code: string, ignoreActive = false): bigint[] {
    const matrix = this.rolePermissions ?? (require('@vaultra/shared') as typeof import('@vaultra/shared')).ROLE_PERMISSIONS;
    const set = new Set<bigint>();
    for (const a of this.assignments) {
      if (a.facilityId === null) continue;
      const g = matrix[a.role]?.[code];
      if (g && g.scope === 'FACILITY') set.add(a.facilityId);
    }
    let ids = [...set];
    if (!ignoreActive && this.activeFacilityId && ids.includes(this.activeFacilityId)) ids = [this.activeFacilityId];
    return ids;
  }
  /** Prisma `where` fragment enforcing data scope for list queries (spec §5.3.1). */
  scope(code: string, opts: { facility?: string | null; customer?: string | null } = {}): Record<string, unknown> {
    const g = this.grants[code];
    if (!g) throw forbidden();
    const facilityField = opts.facility === undefined ? 'facility_id' : opts.facility;
    const customerField = opts.customer === undefined ? 'customer_id' : opts.customer;
    if (g.scope === 'GLOBAL') return {};
    if (g.scope === 'FACILITY') {
      if (!facilityField) throw forbidden();
      return { [facilityField]: { in: this.facilitiesFor(code) } };
    }
    if (!customerField) throw forbidden();
    return { [customerField]: this.customerId ?? BigInt(0) };
  }
  /** Record-level check: out of scope -> 404 (not 403) so existence is not leaked (spec §5.3.2). */
  assertScope(code: string, rec: { facility_id?: bigint | null; customer_id?: bigint | null } | null | undefined, what?: string, write = false) {
    if (!rec) throw notFound(what);
    const g = this.grants[code];
    if (!g) throw notFound(what);
    if (write && g.readOnly) throw forbidden('Bạn chỉ có quyền xem dữ liệu này');
    if (g.scope === 'GLOBAL') return g;
    if (g.scope === 'FACILITY') {
      if (rec.facility_id && this.facilitiesFor(code, true).includes(rec.facility_id)) return g;
      if (rec.customer_id && this.customerId && rec.customer_id === this.customerId) return g;
      throw notFound(what);
    }
    if (rec.customer_id && this.customerId && rec.customer_id === this.customerId) return g;
    throw notFound(what);
  }
  /** Staff may not process money operations on their own rental (spec §5.1 separation of duties). */
  assertNotOwnContract(customerUserId: bigint | null | undefined) {
    if (customerUserId && customerUserId === this.userId && this.primaryRole !== 'CUSTOMER') {
      throw new AppError('FORBIDDEN', 'Không được tự xử lý giao dịch tiền trên hợp đồng của chính mình');
    }
  }
  requireVerified() {
    if (!this.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Vui lòng xác minh email trước khi đặt kho hoặc thanh toán');
  }
}

/** Context used by background jobs (spec §5.3.1 SYSTEM_JOB). */
export const SYSTEM_ACTOR = { userId: null as bigint | null, role: 'SYSTEM' };
