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

/**
 * What a facility manager may do with accounts: see, lock/unlock and reset the password of the staff and customers of their OWN facilities,
 * invite new staff, and grant or withdraw the FACILITY_STAFF role there. Nothing else: no other role, no other facility, no managers/BOM/admins, not themselves.
 */
@Injectable()
export class FacilityAccountsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private contexts: ContextService,
    private notify: NotificationService,
    private hub: RealtimeHub,
  ) {}

  /** Facilities this manager runs (all of them, not only the one selected in the header). */
  managed(ctx: AccessContext): bigint[] {
    const ids = ctx.facilitiesFor(PERM, true);
    if (!ids.length) throw forbidden();
    return ids;
  }

  private includeRoles = { roles: { where: { revoked_at: null }, include: { role: true, facility: { select: { public_id: true, name: true, code: true } } } } };

  private async userOr404(publicId: string): Promise<UserWithRoles> {
    const u = await this.prisma.user.findUnique({ where: { public_id: publicId }, include: this.includeRoles as never });
    if (!u || (u as { deleted_at?: Date | null }).deleted_at) throw notFound('Tài khoản');
    return u as unknown as UserWithRoles;
  }

  /** Customer user ids that rented (or reserved) at one of the facilities. */
  private async customerUserIds(facilityIds: bigint[]): Promise<Set<bigint>> {
    const [res, con] = await Promise.all([
      this.prisma.reservation.findMany({ where: { facility_id: { in: facilityIds } }, select: { customer_id: true } }),
      this.prisma.contract.findMany({ where: { facility_id: { in: facilityIds } }, select: { customer_id: true } }),
    ]);
    const cids = [...new Set([...res, ...con].map((r) => r.customer_id))];
    if (!cids.length) return new Set();
    const customers = await this.prisma.customer.findMany({ where: { id: { in: cids } }, select: { user_id: true } });
    return new Set(customers.map((c) => c.user_id).filter((x): x is bigint => x != null));
  }

  private isPrivileged(u: UserWithRoles) {
    return u.roles.some((r) => PRIVILEGED.includes(r.role.code));
  }

  /** Staff at one of the managed facilities, or a customer of one. */
  private kindOf(u: UserWithRoles, managed: bigint[], customerIds: Set<bigint>): 'STAFF' | 'CUSTOMER' | null {
    if (u.roles.some((r) => r.role.code === STAFF && r.facility_id != null && managed.some((m) => m === r.facility_id))) return 'STAFF';
    if (customerIds.has(u.id)) return 'CUSTOMER';
    return null;
  }

  /** Every facility-scoped role of the target must sit inside the manager's facilities, otherwise a change here would hit another facility. */
  private insideManaged(u: UserWithRoles, managed: bigint[]) {
    return u.roles.every((r) => r.facility_id == null || managed.some((m) => m === r.facility_id));
  }

  private view(u: UserWithRoles, kind: 'STAFF' | 'CUSTOMER', manageable: boolean) {
    return {
      id: u.public_id, email: u.email, full_name: u.full_name, phone: u.phone, status: u.status, last_login_at: u.last_login_at, created_at: u.created_at,
      kind, manageable,
      roles: u.roles.filter((r) => r.role.code === STAFF).map((r) => ({ id: r.id.toString(), role: r.role.code, label: ROLE_META[r.role.code as RoleCode]?.name ?? r.role.code, facility: r.facility ? { id: r.facility.public_id, name: r.facility.name, code: r.facility.code } : null })),
    };
  }

  private async assertManageable(ctx: AccessContext, u: UserWithRoles) {
    const managed = this.managed(ctx);
    if (u.id === ctx.userId) throw forbidden('Bạn không thể thao tác trên chính tài khoản của mình');
    if (this.isPrivileged(u)) throw notFound('Tài khoản');
    const kind = this.kindOf(u, managed, await this.customerUserIds(managed));
    if (!kind) throw notFound('Tài khoản');
    if (!this.insideManaged(u, managed)) throw forbidden('Tài khoản này cũng thuộc cơ sở khác, hãy nhờ quản lý vận hành xử lý');
    return { managed, kind };
  }

  // ---------------------------------------------------------------- read
  async list(ctx: AccessContext, q: { group?: string; status?: string; q?: string; facilityId?: string }, size: number, skip: number) {
    let managed = this.managed(ctx);
    if (q.facilityId) {
      const f = await this.prisma.facility.findUnique({ where: { public_id: q.facilityId } });
      if (!f || !managed.some((m) => m === f.id)) throw notFound('Cơ sở');
      managed = [f.id];
    }
    const group = q.group === 'customers' ? 'customers' : q.group === 'all' ? 'all' : 'staff';
    const ids = new Set<bigint>();
    if (group !== 'customers') {
      const staff = await this.prisma.userRole.findMany({ where: { revoked_at: null, facility_id: { in: managed }, role: { code: STAFF } }, select: { user_id: true } });
      staff.forEach((s) => ids.add(s.user_id));
    }
    const customerIds = group === 'staff' ? new Set<bigint>() : await this.customerUserIds(managed);
    if (group !== 'staff') customerIds.forEach((c) => ids.add(c));
    if (!ids.size) return { rows: [], total: 0 };
    const users = (await this.prisma.user.findMany({ where: { id: { in: [...ids] }, deleted_at: null }, include: this.includeRoles as never, orderBy: { id: 'desc' } })) as unknown as UserWithRoles[];
    const needle = (q.q ?? '').trim().toLowerCase();
    const all = this.managed(ctx);
    const out = users
      .filter((u) => !this.isPrivileged(u))
      .filter((u) => !q.status || q.status.split(',').includes(u.status))
      .filter((u) => !needle || [u.email, u.full_name, u.phone ?? ''].some((x) => x.toLowerCase().includes(needle)))
      .map((u) => {
        const kind = this.kindOf(u, managed, customerIds) ?? 'CUSTOMER';
        return this.view(u, kind, u.id !== ctx.userId && this.insideManaged(u, all));
      });
    return { rows: out.slice(skip, skip + size + 1), total: out.length };
  }

  async get(ctx: AccessContext, publicId: string) {
    const u = await this.userOr404(publicId);
    const managed = this.managed(ctx);
    if (this.isPrivileged(u)) throw notFound('Tài khoản');
    const kind = this.kindOf(u, managed, await this.customerUserIds(managed));
    if (!kind) throw notFound('Tài khoản');
    return this.view(u, kind, u.id !== ctx.userId && this.insideManaged(u, managed));
  }

  /** Looks an account up by e-mail so the manager can grant it the staff role. Privileged accounts answer like a missing one. */
  async lookup(ctx: AccessContext, email: string) {
    const managed = this.managed(ctx);
    const u = (await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: this.includeRoles as never })) as unknown as UserWithRoles | null;
    if (!u || this.isPrivileged(u) || u.id === ctx.userId || (u as unknown as { deleted_at?: Date | null }).deleted_at) return { found: false };
    const here = u.roles.filter((r) => r.role.code === STAFF && r.facility_id != null && managed.some((m) => m === r.facility_id)).map((r) => r.facility?.name ?? '');
    return { found: true, id: u.public_id, full_name: u.full_name, email: u.email, status: u.status, staffAt: here, elsewhere: u.roles.some((r) => r.facility_id != null && !managed.some((m) => m === r.facility_id)) };
  }

  // ---------------------------------------------------------------- status
  /** Customers can be locked and unlocked; staff can also be disabled and re-enabled. */
  async setStatus(ctx: AccessContext, publicId: string, to: AccountStatus, reason: string) {
    const u = await this.userOr404(publicId);
    const { kind } = await this.assertManageable(ctx, u);
    if (kind === 'CUSTOMER' && to === 'DISABLED') throw forbidden('Chỉ có thể khóa tạm thời tài khoản khách hàng. Vô hiệu hóa do quản lý vận hành hoặc quản trị hệ thống thực hiện');
    if (kind === 'CUSTOMER' && u.status === 'DISABLED') throw forbidden('Tài khoản này đã bị vô hiệu hóa, chỉ quản trị mới kích hoạt lại được');
    const revoke = to !== 'ACTIVE';
    await this.prisma.user.update({ where: { id: u.id }, data: { status: to, locked_until: null, failed_login_count: 0, token_version: revoke ? { increment: 1 } : undefined } });
    if (revoke) await this.auth.revokeAllSessions(u.id, 'ADMIN');
    this.contexts.invalidate(u.id);
    await this.audit.log(ctx, { action: `user.${to.toLowerCase()}`, entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', before: { status: u.status }, after: { status: to, by: 'FACILITY_MANAGER' }, reason });
    if (to === 'DISABLED') {
      await this.notify.sendDirect(u.id, 'user.disabled', { name: u.full_name, reason }).catch(() => undefined);
      const facs = [...new Set(u.roles.map((r) => r.facility_id).filter((x): x is bigint => !!x).map(String))].map((x) => BigInt(x));
      if (facs.length) await this.releaseAssignedWork(ctx, u.id, facs, `Tài khoản bị vô hiệu hóa: ${reason}`);
    }
    return this.get(ctx, publicId);
  }

  async resetPassword(ctx: AccessContext, publicId: string) {
    const u = await this.userOr404(publicId);
    await this.assertManageable(ctx, u);
    await this.auth.forgotPassword(u.email, { ip: ctx.ip, ua: ctx.userAgent });
    await this.audit.log(ctx, { action: 'user.reset_password_sent', entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', after: { by: 'FACILITY_MANAGER' } });
    return { message: 'Đã gửi email đặt lại mật khẩu' };
  }

  // ---------------------------------------------------------------- staff role
  private async facilityOrThrow(managed: bigint[], publicId: string) {
    const f = await this.prisma.facility.findUnique({ where: { public_id: publicId } });
    if (!f || !managed.some((m) => m === f.id)) throw forbidden('Bạn chỉ cấp quyền nhân viên cho cơ sở do mình quản lý');
    return f;
  }

  /** New staff account (invited by e-mail) with the staff role at one of the manager's facilities. */
  async inviteStaff(ctx: AccessContext, d: { email: string; fullName: string; phone?: string; facilityId: string }) {
    const managed = this.managed(ctx);
    const f = await this.facilityOrThrow(managed, d.facilityId);
    const email = d.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new AppError('CONFLICT', 'Email này đã có tài khoản. Hãy dùng "Cấp quyền cho tài khoản có sẵn" thay vì mời mới');
    const role = await this.prisma.role.findUnique({ where: { code: STAFF as never } });
    if (!role) throw validation('Vai trò không hợp lệ');
    const token = randomToken();
    const user = await this.prisma.tx(async (tx) => {
      const u = await tx.user.create({ data: { public_id: newId(), email, full_name: d.fullName, phone: d.phone, status: 'INVITED' } });
      await tx.userRole.create({ data: { user_id: u.id, role_id: role.id, facility_id: f.id, assigned_by: ctx.userId } });
      await tx.authToken.create({ data: { user_id: u.id, purpose: 'INVITE', token_hash: sha256(token), expires_at: new Date(Date.now() + 7 * 86400000), created_ip: ctx.ip?.slice(0, 45) } });
      await this.audit.log(ctx, { action: 'user.create', entityType: 'user', entityId: u.id, entityRef: u.email, facilityId: f.id, category: 'SECURITY', after: { roles: [{ role: STAFF, facilityId: d.facilityId }], by: 'FACILITY_MANAGER' } }, tx);
      return u;
    });
    const label = ROLE_META[STAFF as RoleCode].name;
    await this.notify.sendDirect(user.id, 'user.invited', { name: d.fullName, role: label, roles: `${label} (${f.name})`, facility: f.name, facilityText: ` tại ${f.name}` }, `${config.appOrigin}/accept-invite#token=${token}`, 'Kích hoạt tài khoản');
    return this.get(ctx, user.public_id).catch(() => ({ id: user.public_id, email }));
  }

  /** Grants the staff role at a managed facility to an existing account (never any other role, never to a manager / BOM / admin / yourself). */
  async grantStaff(ctx: AccessContext, publicId: string, d: { facilityId: string; reason: string }) {
    const managed = this.managed(ctx);
    const u = await this.userOr404(publicId);
    if (u.id === ctx.userId) throw forbidden('Bạn không thể tự cấp quyền cho chính mình');
    if (this.isPrivileged(u)) throw notFound('Tài khoản');
    if (u.status === 'DISABLED') throw forbidden('Tài khoản đã bị vô hiệu hóa');
    const f = await this.facilityOrThrow(managed, d.facilityId);
    const role = await this.prisma.role.findUnique({ where: { code: STAFF as never } });
    if (!role) throw validation('Vai trò không hợp lệ');
    if (u.roles.some((r) => r.role.code === STAFF && r.facility_id === f.id)) throw new AppError('CONFLICT', 'Tài khoản đã là nhân viên của cơ sở này');
    await this.prisma.userRole.create({ data: { user_id: u.id, role_id: role.id, facility_id: f.id, assigned_by: ctx.userId } });
    await this.afterRoleChange(ctx, u, 'assign', { facilityId: f.id, facilityName: f.name, reason: d.reason });
    return this.get(ctx, publicId);
  }

  /** Withdraws the staff role at a managed facility. The person's open work at that facility goes back to the queue. */
  async revokeStaff(ctx: AccessContext, publicId: string, assignmentId: string, reason: string) {
    const managed = this.managed(ctx);
    const u = await this.userOr404(publicId);
    if (u.id === ctx.userId) throw forbidden('Bạn không thể tự gỡ quyền của chính mình');
    if (this.isPrivileged(u)) throw notFound('Tài khoản');
    const a = u.roles.find((r) => r.id.toString() === assignmentId);
    if (!a || a.role.code !== STAFF || a.facility_id == null || !managed.some((m) => m === a.facility_id)) throw notFound('Vai trò');
    await this.prisma.userRole.update({ where: { id: a.id }, data: { revoked_at: new Date(), revoked_by: ctx.userId } });
    await this.auth.ensureBaseRole(u.id); // never leave an account without a role: the person goes back to being a customer
    const stillThere = await this.prisma.userRole.count({ where: { user_id: u.id, facility_id: a.facility_id, revoked_at: null } });
    if (!stillThere) await this.releaseAssignedWork(ctx, u.id, [a.facility_id], `Gỡ khỏi cơ sở: ${reason}`);
    await this.afterRoleChange(ctx, u, 'revoke', { facilityId: a.facility_id, facilityName: a.facility?.name ?? null, reason });
    return this.get(ctx, publicId).catch(() => ({ id: publicId, removed: true }));
  }

  // ---------------------------------------------------------------- shared effects (same behaviour as the admin screen)
  private async releaseAssignedWork(ctx: AccessContext, userId: bigint, facilityIds: bigint[], reason: string) {
    await this.prisma.tx(async (tx) => {
      for (const facilityId of facilityIds) {
        const tasks = await tx.workTask.findMany({ where: { facility_id: facilityId, assignee_id: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } } });
        for (const t of tasks) {
          await tx.workTask.update({ where: { id: t.id }, data: { assignee_id: null, status: 'OPEN', version: { increment: 1 } } });
          await tx.taskEvent.create({ data: { task_id: t.id, event: 'REASSIGNED', from_user_id: userId, to_user_id: null, actor_user_id: ctx.userId, note: reason.slice(0, 255) } });
        }
        const tickets = await tx.supportTicket.findMany({ where: { facility_id: facilityId, assignee_id: userId, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED'] } } });
        for (const t of tickets) {
          await tx.supportTicket.update({ where: { id: t.id }, data: { assignee_id: null, status: t.status === 'ASSIGNED' ? 'NEW' : t.status, version: { increment: 1 } } });
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'ASSIGNED', actor_user_id: ctx.userId, data: { from: userId.toString(), to: null, reason } } });
        }
        await tx.appointment.updateMany({ where: { facility_id: facilityId, assigned_staff_id: userId, status: 'BOOKED' }, data: { assigned_staff_id: null } });
      }
    });
  }

  private async afterRoleChange(ctx: AccessContext, u: UserWithRoles, kind: 'assign' | 'revoke', d: { facilityId: bigint; facilityName: string | null; reason: string }) {
    await this.prisma.user.update({ where: { id: u.id }, data: { token_version: { increment: 1 } } });
    await this.auth.revokeAllSessions(u.id, 'ROLE_CHANGED');
    this.contexts.invalidate(u.id);
    this.hub.revokeUser(u.public_id);
    await this.audit.log(ctx, { action: `user.role_${kind}`, entityType: 'user', entityId: u.id, entityRef: u.email, facilityId: d.facilityId, category: 'SECURITY', after: { role: STAFF, facilityId: d.facilityId.toString(), reason: d.reason, by: 'FACILITY_MANAGER' } });
    const label = ROLE_META[STAFF as RoleCode].name;
    const facPart = d.facilityName ? ` tại ${d.facilityName}` : '';
    const change = kind === 'assign' ? `Đã cấp vai trò ${label}${facPart}` : `Đã gỡ vai trò ${label}${facPart} (${d.reason})`;
    const active = await this.prisma.userRole.findMany({ where: { user_id: u.id, revoked_at: null }, include: { role: true, facility: { select: { name: true } } } });
    const current = active.map((ar) => `${ROLE_META[ar.role.code as RoleCode]?.name ?? ar.role.code}${ar.facility?.name ? ` (${ar.facility.name})` : ''}`).join(', ');
    await this.notify.sendDirect(u.id, 'user.role_changed', { name: u.full_name, change, role: label, roles: current || 'Khách thuê kho', facility: d.facilityName ?? '', reason: d.reason }, `${config.appOrigin}/login`, 'Đăng nhập lại').catch(() => undefined);
  }
}
